import { UpesiPayService } from './upesipay.service';

describe('UpesiPayService', () => {
  const db = { query: jest.fn() };
  const config = { get: jest.fn() };
  const service = new UpesiPayService(db as any, config as any);

  beforeEach(() => {
    db.query.mockReset();
    config.get.mockReset();
  });

  it('builds a Merchant Link from a configured custom tag', async () => {
    db.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        credentialsRef: 'UPESIPAY_AUTH_TOKEN',
        metadata: { customTag: 'jaslyn-demo' },
      }],
    });
    config.get.mockReturnValue('test-token');

    await expect(service.merchantLink('tenant-1')).resolves.toEqual({
      url: 'https://upesipay.com/m/jaslyn-demo',
      mode: 'custom_tag',
    });
  });

  it('builds a PayLink URL without accepting unsafe tags', async () => {
    await expect(service.payLink('tenant-1', 'INV-2026-001')).resolves.toEqual({
      url: 'https://upesipay.com/p/INV-2026-001',
      tag: 'INV-2026-001',
    });
    await expect(service.payLink('tenant-1', 'bad tag')).rejects.toThrow('Invalid UpesiPay PayLink tag');
  });

  it('rejects callback payloads without a provider event identifier', async () => {
    await expect(service.recordCallback('tenant-1', { status: 'success' }))
      .rejects.toThrow('no usable event identifier');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('stores callbacks as pending verification', async () => {
    db.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 'event-1',
        providerEventId: 'ref-1',
        status: 'success',
        verificationStatus: 'PENDING',
      }],
    });

    await expect(service.recordCallback('tenant-1', {
      reference_id: 'ref-1',
      checkout_request_id: 'checkout-1',
      status: 'success',
    })).resolves.toMatchObject({
      accepted: true,
      requiresVerification: true,
      data: { verificationStatus: 'PENDING' },
    });
  });
});
