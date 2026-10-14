import { AuditService } from '../audit/audit.service';
import { Pool } from 'pg';
import { NetworkAutoHealingService } from './network-auto-healing.service';

describe('NetworkAutoHealingService',()=>{
 const db={query:jest.fn(),connect:jest.fn()};
 const audit={record:jest.fn()};
 let service:NetworkAutoHealingService;
 beforeEach(()=>{jest.clearAllMocks();service=new NetworkAutoHealingService(db as unknown as Pool,audit as unknown as AuditService);});

 it('defaults the tenant policy to disabled and reads only that tenant policy',async()=>{
  db.query.mockResolvedValueOnce({rowCount:1,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{enabled:false,maxAutoRetries:1,cooldownSeconds:60}]});
  await expect(service.getPolicy('tenant-a')).resolves.toMatchObject({enabled:false,maxAutoRetries:1,cooldownSeconds:60});
  expect(db.query).toHaveBeenNthCalledWith(1,expect.stringContaining('ON CONFLICT(tenant_id) DO NOTHING'),['tenant-a']);
  expect(db.query).toHaveBeenNthCalledWith(2,expect.stringContaining('WHERE tenant_id=$1'),['tenant-a']);
 });

 it('requeues a failed supported command atomically and writes an audit record',async()=>{
  const client={query:jest.fn()
   .mockResolvedValueOnce({}) // BEGIN
   .mockResolvedValueOnce({}) // stale lock recovery
   .mockResolvedValueOnce({rows:[{tenant_id:'tenant-a',id:'command-a',attempts:1,command_type:'BANDWIDTH_ENFORCEMENT',router_id:'router-a',actor:'operator',provider:'MIKROTIK_REST'}],rowCount:1})
   .mockResolvedValueOnce({rows:[],rowCount:0}) // no previous run for this attempt
   .mockResolvedValueOnce({rows:[{id:'run-a'}],rowCount:1}) // claim run
   .mockResolvedValueOnce({rows:[{id:'command-a'}],rowCount:1}) // move FAILED to RETRYING
   .mockResolvedValueOnce({}) // run status
   .mockResolvedValueOnce({}) , // COMMIT
   release:jest.fn()};
  db.connect.mockResolvedValueOnce(client);
  await expect(service.runDueRetries()).resolves.toEqual({claimed:1,requeued:1,skipped:0});
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining("status='FAILED' AND attempts=$3"),['tenant-a','command-a',1]);
  expect(audit.record).toHaveBeenCalledWith('tenant-a','NETWORK_AUTO_HEAL_RETRY_QUEUED','network_command','command-a',
   {attempt:1,commandType:'BANDWIDTH_ENFORCEMENT',routerId:'router-a',status:'REQUEUED'});
  expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  expect(client.release).toHaveBeenCalled();
 });

 it('does not report a retry when the command changed state before the update',async()=>{
  const client={query:jest.fn()
   .mockResolvedValueOnce({}).mockResolvedValueOnce({})
   .mockResolvedValueOnce({rows:[{tenant_id:'tenant-a',id:'command-a',attempts:1,command_type:'DISCONNECT_SESSION',router_id:'router-a',actor:'operator',provider:'MIKROTIK_REST'}],rowCount:1})
   .mockResolvedValueOnce({rows:[],rowCount:0})
   .mockResolvedValueOnce({rows:[{id:'run-a'}],rowCount:1})
   .mockResolvedValueOnce({rows:[],rowCount:0}) // command no longer FAILED
   .mockResolvedValueOnce({}).mockResolvedValueOnce({}),
   release:jest.fn()};
  db.connect.mockResolvedValueOnce(client);
  await expect(service.runDueRetries()).resolves.toEqual({claimed:1,requeued:0,skipped:1});
  expect(audit.record).not.toHaveBeenCalled();
 });

 it('keeps tenant identity and bounded retry conditions in the candidate query',async()=>{
  const client={query:jest.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({rows:[],rowCount:0}).mockResolvedValueOnce({}),release:jest.fn()};
  db.connect.mockResolvedValueOnce(client);
  await service.runDueRetries();
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('p.enabled=true'),[]);
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('c.attempts BETWEEN 1 AND p.max_auto_retries'),[]);
 });
});
