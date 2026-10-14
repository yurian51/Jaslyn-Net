import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { AuditService } from '../audit/audit.service';
import { OperationsHubService } from './operations-hub.service';

describe('OperationsHubService', () => {
  const query = jest.fn();
  const connect = jest.fn();
  const db = { query, connect } as unknown as Pool;
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as unknown as AuditService;
  let service: OperationsHubService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OperationsHubService(db, audit);
  });

  it('rejects integration config that tries to store secrets', async () => {
    await expect(service.saveIntegration('tenant-1', 'user-1', {
      providerKey: 'vendor_api', displayName: 'Vendor API', config: { apiKey: 'must-not-be-saved' },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('requires explicit runbook steps before saving', async () => {
    await expect(service.createRunbook('tenant-1', 'user-1', { name: 'Empty runbook', steps: [] }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects a runbook execution idempotency key that is too short', async () => {
    await expect(service.executeRunbook('tenant-1', 'user-1', 'runbook-1', { idempotencyKey: 'x' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects unsupported change types before writing', async () => {
    await expect(service.createChange('tenant-1', 'user-1', {
      changeType: 'ARBITRARY_COMMAND', targetType: 'router', targetId: 'router-1',
      title: 'Unsafe action', proposedChange: {}, idempotencyKey: 'change-key-0001',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('scopes artifact listing to the authenticated tenant and owner visibility', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await service.listArtifacts('tenant-1', 'user-1');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('a.tenant_id=$1');
    expect(query.mock.calls[0][0]).toContain('a.owner_user_id=$2');
    expect(query.mock.calls[0][1]).toEqual(['tenant-1', 'user-1']);
  });

  it('does not allow a requester to approve their own change', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.reviewChange('tenant-1', 'requester-1', 'change-1', { status: 'APPROVED' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(query.mock.calls[0][0]).toContain('requested_by<>$4');
    expect(query.mock.calls[0][1]).toEqual(['tenant-1', 'change-1', 'APPROVED', 'requester-1', null]);
  });
});
