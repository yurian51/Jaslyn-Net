import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { AuditService } from '../audit/audit.service';
import { WorkflowsService } from './workflows.service';

describe('WorkflowsService safety and tenant boundaries', () => {
  const db = { query: jest.fn(), connect: jest.fn() };
  const audit = { record: jest.fn() };
  const notifications = { enqueue: jest.fn(), enqueueSms: jest.fn() };
  const secrets = { getSecretValue: jest.fn() };
  const service = new WorkflowsService(db as unknown as Pool, audit as unknown as AuditService, notifications as never, secrets as never);
  beforeEach(() => { jest.clearAllMocks(); });

  it('accepts safe dotted TRANSFORM source and destination paths', async () => {
    db.query.mockResolvedValueOnce({rowCount:1,rows:[{
      id:'workflow-1',name:'safe transform',triggerType:'MANUAL',triggerConfig:{},
      steps:[{type:'TRANSFORM',mappings:[{from:'payment.status',to:'workflow.paymentStatus'}]}],enabled:false,
    }]});
    await expect(service.create('tenant-a','user-a',{
      name:'safe transform',triggerType:'MANUAL',steps:[{type:'TRANSFORM',mappings:[{from:'payment.status',to:'workflow.paymentStatus'}]}],
    })).resolves.toMatchObject({id:'workflow-1'});
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('rejects unsafe notification recipient paths before persistence', async () => {
    await expect(service.create('tenant-a','user-a',{
      name:'unsafe notification',triggerType:'MANUAL',steps:[{type:'NOTIFY',channel:'SMS',recipientPath:'__proto__.phone',message:'hello',category:'TRANSACTIONAL'}],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects unsafe HTTP integration paths before persistence', async () => {
    await expect(service.create('tenant-a','user-a',{
      name:'unsafe HTTP request',triggerType:'MANUAL',steps:[{
        type:'HTTP_REQUEST',integrationId:'11111111-1111-4111-8111-111111111111',method:'POST',path:'//169.254.169.254/latest/meta-data',body:{},
      }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects unsupported notification channels before persistence', async () => {
    await expect(service.create('tenant-a','user-a',{
      name:'unsupported notification',triggerType:'MANUAL',steps:[{type:'NOTIFY',channel:'SHELL',recipientPath:'customer.phone',message:'hello'}],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects unsafe TRANSFORM destination paths before persistence', async () => {
    await expect(service.create('tenant-a','user-a',{
      name:'unsafe transform',triggerType:'MANUAL',steps:[{type:'TRANSFORM',mappings:[{from:'payment.status',to:'__proto__.polluted'}]}],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects unbounded or empty TRANSFORM mapping lists before persistence', async () => {
    await expect(service.create('tenant-a','user-a',{
      name:'empty transform',triggerType:'MANUAL',steps:[{type:'TRANSFORM',mappings:[]}],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects conditional branches with invalid skip counts', async () => {
    await expect(service.create('tenant-a','user-a',{
      name:'unsafe branch',triggerType:'MANUAL',steps:[{type:'CONDITION',path:'payment.status',op:'eq',value:'PAID',onFalse:'SKIP',skipSteps:0}],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects arbitrary execution steps before any database write', async () => {
    await expect(service.create('tenant-a','user-a',{
      name:'unsafe workflow',triggerType:'MANUAL',steps:[{type:'RUN_SHELL',command:'id'}],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects prototype traversal in condition paths', async () => {
    await expect(service.create('tenant-a','user-a',{
      name:'unsafe condition',triggerType:'MANUAL',steps:[{type:'CONDITION',path:'__proto__.x',op:'eq',value:1}],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects invalid schedule intervals before persistence', async () => {
    await expect(service.create('tenant-a','user-a',{
      name:'fast schedule',triggerType:'SCHEDULE',triggerConfig:{intervalSeconds:1},steps:[{type:'LOG',message:'tick'}],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects IP-literal integration hosts to reduce SSRF risk', async () => {
    await expect(service.createIntegration('tenant-a','user-a',{
      name:'private host',providerType:'REST_API',baseUrl:'https://127.0.0.1/admin',enabled:false,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('requires an HTTPS integration URL for generic HTTP integrations', async () => {
    await expect(service.createIntegration('tenant-a','user-a',{
      name:'unsafe endpoint',providerType:'REST_API',baseUrl:'http://127.0.0.1:3000',enabled:true,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('requires secret references to belong to the current tenant', async () => {
    db.query.mockResolvedValueOnce({rowCount:0,rows:[]});
    await expect(service.createIntegration('tenant-a','user-a',{
      name:'foreign secret',providerType:'SMS',secretRef:'11111111-1111-4111-8111-111111111111',enabled:false,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1]).toEqual(['tenant-a','11111111-1111-4111-8111-111111111111']);
  });

  it('does not accept a wrong webhook token', async () => {
    db.query.mockResolvedValueOnce({rowCount:1,rows:[{
      id:'workflow-a',tenant_id:'tenant-a',webhook_token_hash:createHash('sha256').update('correct-token').digest('hex'),
    }]});
    await expect(service.triggerWebhook('workflow-a','wrong-token',{eventId:'evt-1'})).rejects.toThrow('Invalid workflow webhook token');
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
