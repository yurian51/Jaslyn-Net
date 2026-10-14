import { AuditService } from './audit.service';
import { Pool } from 'pg';

describe('AuditService', () => {
  it('redacts sensitive metadata recursively before persistence', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 'audit-1' }], rowCount: 1 }),
    } as unknown as Pool;
    const service = new AuditService(db);

    await service.record('tenant-1', 'router.updated', 'router', 'router-1', {
      vendor: 'MikroTik',
      managementCredentials: {
        username: 'admin',
        password: 'super-secret',
        apiKey: 'api-secret',
        nested: [{ accessToken: 'token-secret', safe: 'ok' }],
      },
      safe: { status: 'ONLINE' },
      diagnostic: 'Authorization: Bearer raw-token-value',
      url: '/api?access_token=query-token-value',
    });

    const params = (db.query as jest.Mock).mock.calls[0][1] as unknown[];
    expect(params[9]).toEqual({
      vendor: 'MikroTik',
      managementCredentials: {
        username: '[REDACTED]',
        password: '[REDACTED]',
        apiKey: '[REDACTED]',
        nested: [{ accessToken: '[REDACTED]', safe: 'ok' }],
      },
      safe: { status: 'ONLINE' },
      diagnostic: 'Authorization: Bearer [REDACTED]',
      url: '/api?access_token=[REDACTED]',
    });
    expect(JSON.stringify(params[9])).not.toContain('super-secret');
    expect(JSON.stringify(params[9])).not.toContain('api-secret');
    expect(JSON.stringify(params[9])).not.toContain('token-secret');
    expect(JSON.stringify(params[9])).not.toContain('raw-token-value');
    expect(JSON.stringify(params[9])).not.toContain('query-token-value');
  });

  it('bounds oversized audit metadata collections and strings', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 'audit-2' }], rowCount: 1 }),
    } as unknown as Pool;
    const service = new AuditService(db);
    const huge = Array.from({ length: 150 }, (_, index) => ({ index, value: 'x'.repeat(3000) }));

    await service.record('tenant-1', 'test', 'system', undefined, { huge });

    const params = (db.query as jest.Mock).mock.calls[0][1] as unknown[];
    const metadata = params[9] as { huge: Array<{ index: number; value: string }> };
    expect(metadata.huge).toHaveLength(100);
    expect(metadata.huge[0].value).toHaveLength(2001);
  });

  it('keeps tenant isolation in audit reads', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    } as unknown as Pool;
    const service = new AuditService(db);

    await service.list('tenant-42', 9999);

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE a.tenant_id = $1'), ['tenant-42', 500]);
  });
  it('reports a valid audit chain only when entries and the stored head agree', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ total: 2, invalid: 0, last_sequence: 2, last_hash: 'hash-2' }] })
        .mockResolvedValueOnce({ rows: [{ lastSequence: '2', lastHash: 'hash-2' }] }),
    } as unknown as Pool;
    const service = new AuditService(db);

    await expect(service.verifyIntegrity('tenant-1')).resolves.toMatchObject({
      tenantId: 'tenant-1', valid: true, checkedEntries: 2, invalidEntries: 0, headMatches: true,
    });
  });

  it('detects an audit chain head mismatch', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ total: 2, invalid: 0, last_sequence: 2, last_hash: 'actual-last-hash' }] })
        .mockResolvedValueOnce({ rows: [{ lastSequence: '2', lastHash: 'different-hash' }] }),
    } as unknown as Pool;
    const service = new AuditService(db);

    await expect(service.verifyIntegrity('tenant-1')).resolves.toMatchObject({
      valid: false, invalidEntries: 1, headMatches: false,
    });
  });

  it('lists security alerts within the authenticated tenant only', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'alert-1' }], rowCount: 1 }) } as unknown as Pool;
    const service = new AuditService(db);

    await expect(service.listSecurityAlerts('tenant-1', 9999)).resolves.toEqual({ data: [{ id: 'alert-1' }], count: 1 });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE tenant_id=$1'), ['tenant-1', 500]);
  });

});
