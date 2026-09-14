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
    });

    const params = (db.query as jest.Mock).mock.calls[0][1] as unknown[];
    expect(params[8]).toEqual({
      vendor: 'MikroTik',
      managementCredentials: {
        username: '[REDACTED]',
        password: '[REDACTED]',
        apiKey: '[REDACTED]',
        nested: [{ accessToken: '[REDACTED]', safe: 'ok' }],
      },
      safe: { status: 'ONLINE' },
    });
    expect(JSON.stringify(params[8])).not.toContain('super-secret');
    expect(JSON.stringify(params[8])).not.toContain('api-secret');
    expect(JSON.stringify(params[8])).not.toContain('token-secret');
  });

  it('bounds oversized audit metadata collections and strings', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 'audit-2' }], rowCount: 1 }),
    } as unknown as Pool;
    const service = new AuditService(db);
    const huge = Array.from({ length: 150 }, (_, index) => ({ index, value: 'x'.repeat(3000) }));

    await service.record('tenant-1', 'test', 'system', undefined, { huge });

    const params = (db.query as jest.Mock).mock.calls[0][1] as unknown[];
    const metadata = params[8] as { huge: Array<{ index: number; value: string }> };
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
});
