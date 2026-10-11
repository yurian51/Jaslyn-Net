import { NotificationsWorker } from './notifications.worker';
import { SmsProviderError } from './sms-gateway.service';

describe('NotificationsWorker', () => {
  const config = (enabled: string) => ({ get: (key: string) => key === 'SMS_ENABLED' ? enabled : undefined }) as any;

  it('does not claim messages when SMS is disabled', async () => {
    const notifications = { claimSms: jest.fn(), markSent: jest.fn(), markFailed: jest.fn(), deferSms: jest.fn() } as any;
    const provider = { status: jest.fn().mockResolvedValue({ configured: false }), send: jest.fn() } as any;
    const worker = new NotificationsWorker(notifications, provider, config('false'));
    await worker.process();
    expect(notifications.claimSms).not.toHaveBeenCalled();
  });

  it('sends claimed SMS and persists provider acknowledgement for the correct tenant', async () => {
    const notifications = {
      claimSms: jest.fn().mockResolvedValue([{
        id: 'sms-1', tenantId: 'tenant-a', recipient: '255712345678',
        payload: { message: 'Receipt' }, attempts: 1, dedupeKey: 'receipt-1',
      }]),
      markSent: jest.fn().mockResolvedValue({ status: 'SENT' }),
      markFailed: jest.fn(), markPermanentlyFailed: jest.fn(), deferSms: jest.fn(),
    } as any;
    const provider = {
      status: jest.fn().mockResolvedValue({ configured: true }),
      send: jest.fn().mockResolvedValue({ providerMessageId: 'beem-123', accepted: true }),
    } as any;
    const worker = new NotificationsWorker(notifications, provider, config('true'));
    await worker.process();
    expect(provider.status).toHaveBeenCalledWith('tenant-a');
    expect(provider.send).toHaveBeenCalledWith('tenant-a', '255712345678', 'Receipt', 'receipt-1');
    expect(notifications.markSent).toHaveBeenCalledWith('sms-1', 'beem-123');
    expect(notifications.markFailed).not.toHaveBeenCalled();
  });

  it('defers without consuming retries when a tenant provider is not configured', async () => {
    const notifications = {
      claimSms: jest.fn().mockResolvedValue([{
        id: 'sms-3', tenantId: 'tenant-a', recipient: '255712345678',
        payload: { message: 'Receipt' }, attempts: 1, dedupeKey: 'receipt-3',
      }]),
      markSent: jest.fn(), markFailed: jest.fn(), markPermanentlyFailed: jest.fn(), deferSms: jest.fn(),
    } as any;
    const provider = { status: jest.fn().mockResolvedValue({ configured: false }), send: jest.fn() } as any;
    const worker = new NotificationsWorker(notifications, provider, config('true'));
    await worker.process();
    expect(notifications.deferSms).toHaveBeenCalledWith('sms-3', 'SMS provider is not configured or enabled for this tenant');
    expect(notifications.markFailed).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('marks permanent provider rejections failed without retrying', async () => {
    const notifications = {
      claimSms: jest.fn().mockResolvedValue([{
        id: 'sms-4', tenantId: 'tenant-a', recipient: '255712345678',
        payload: { message: 'Receipt' }, attempts: 1, dedupeKey: 'receipt-4',
      }]),
      markSent: jest.fn(), markFailed: jest.fn(), markPermanentlyFailed: jest.fn(), deferSms: jest.fn(),
    } as any;
    const provider = {
      status: jest.fn().mockResolvedValue({ configured: true }),
      send: jest.fn().mockRejectedValue(new SmsProviderError('HTTP 401', false)),
    } as any;
    const worker = new NotificationsWorker(notifications, provider, config('true'));
    await worker.process();
    expect(notifications.markPermanentlyFailed).toHaveBeenCalledWith('sms-4', 'HTTP 401');
    expect(notifications.markFailed).not.toHaveBeenCalled();
  });

  it('requeues provider failures with a bounded retry delay', async () => {
    const notifications = {
      claimSms: jest.fn().mockResolvedValue([{
        id: 'sms-2', tenantId: 'tenant-a', recipient: '255712345678',
        payload: { message: 'Receipt' }, attempts: 3, dedupeKey: 'receipt-2',
      }]),
      markSent: jest.fn(), markFailed: jest.fn(), deferSms: jest.fn(),
    } as any;
    const provider = {
      status: jest.fn().mockResolvedValue({ configured: true }),
      send: jest.fn().mockRejectedValue(new Error('provider timeout')),
    } as any;
    const worker = new NotificationsWorker(notifications, provider, config('true'));
    await worker.process();
    expect(provider.send).toHaveBeenCalledWith('tenant-a', '255712345678', 'Receipt', 'receipt-2');
    expect(notifications.markFailed).toHaveBeenCalledWith('sms-2', 'provider timeout', 60);
    expect(notifications.markSent).not.toHaveBeenCalled();
  });
});
