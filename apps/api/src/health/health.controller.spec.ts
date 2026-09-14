import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns liveness without touching the database', () => {
    const db = { query: jest.fn() } as never;
    const controller = new HealthController(db);

    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('jaslyn-net-api');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns ready when the database probe succeeds', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ ok: 1 }] }) } as never;
    const controller = new HealthController(db);

    const result = await controller.ready();

    expect(result.status).toBe('ready');
    expect(result.database).toBe('ok');
    expect(db.query).toHaveBeenCalledWith('select 1 as ok');
  });

  it('fails with 503 when the database probe throws', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('connection refused')) } as never;
    const controller = new HealthController(db);

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(controller.ready()).rejects.toMatchObject({
      status: 503,
      response: { statusCode: 503, message: 'Database is not ready' },
    });
  });

  it('fails with 503 when the database probe returns an unexpected result', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ ok: 0 }] }) } as never;
    const controller = new HealthController(db);

    await expect(controller.ready()).rejects.toMatchObject({
      status: 503,
      response: { statusCode: 503, message: 'Database readiness check failed' },
    });
  });
});
