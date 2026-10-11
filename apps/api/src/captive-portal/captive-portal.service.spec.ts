import { BadRequestException, NotFoundException, TooManyRequestsException } from '@nestjs/common';
import { Pool } from 'pg';
import { CaptivePortalService } from './captive-portal.service';
import { VouchersService } from '../vouchers/vouchers.service';

describe('CaptivePortalService', () => {
  const db = { query: jest.fn() };
  const vouchers = { redeem: jest.fn() };
  const service = new CaptivePortalService(db as unknown as Pool, vouchers as unknown as VouchersService);

  beforeEach(() => jest.clearAllMocks());

  it('rejects malformed public slugs before querying the database', async () => {
    await expect(service.getPublicPortal('../other-tenant')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('does not expose a tenant portal when it is disabled', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ enabled: false }] });
    await expect(service.getPublicPortal('my-isp')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('loads only active portal-visible packages for the resolved tenant', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'tenant-1', name: 'My ISP', slug: 'my-isp', currency: 'TZS', enabled: true, title: 'My Wi-Fi', welcomeMessage: 'Welcome', termsText: 'Terms' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'package-1', name: 'Daily', price: '1000', currency: 'TZS', durationSeconds: 86400 }] });
    const result = await service.getPublicPortal('MY-ISP');
    expect(result.portal).toMatchObject({ name: 'My Wi-Fi', slug: 'my-isp' });
    expect(result.packages).toHaveLength(1);
    expect(db.query.mock.calls[1][1]).toEqual(['tenant-1']);
    expect(db.query.mock.calls[1][0]).toContain('tenant_id=$1 AND is_active=true AND show_on_portal=true');
  });

  it('requires usable terms before changing settings', async () => {
    await expect(service.updateSettings('tenant-1', 'user-1', { enabled: true, termsText: ' ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects invalid phone numbers before making database changes', async () => {
    await expect(service.redeemPublicVoucher('my-isp', { fullName: 'Amina Juma', phone: '123', code: 'ABC12345' }, '127.0.0.1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
    expect(vouchers.redeem).not.toHaveBeenCalled();
  });

  it('does not redeem vouchers when the tenant attempt limit is reached', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ attemptCount: 10, blockedUntil: new Date(Date.now() + 60_000) }] });
    await expect(service.redeemPublicVoucher('my-isp', { fullName: 'Amina Juma', phone: '+255712345678', code: 'ABC12345' }, '127.0.0.1'))
      .rejects.toBeInstanceOf(TooManyRequestsException);
    expect(vouchers.redeem).not.toHaveBeenCalled();
  });

  it('creates or reuses a tenant customer and delegates actual voucher redemption', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ attemptCount: 1, blockedUntil: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'customer-1' }] });
    vouchers.redeem.mockResolvedValueOnce({ redeemed: true, purchaseId: 'purchase-1', deviceLimit: 1 });
    const result = await service.redeemPublicVoucher('my-isp', { fullName: 'Amina Juma', phone: '+255712345678', code: 'abc12345' }, '127.0.0.1');
    expect(vouchers.redeem).toHaveBeenCalledWith('tenant-1', 'abc12345', { customerId: 'customer-1', routerId: undefined });
    expect(result).toMatchObject({ redeemed: true, purchaseId: 'purchase-1' });
    expect(result.message).toContain('Network access is being provisioned');
  });
});
