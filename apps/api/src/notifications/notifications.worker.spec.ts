import { NotificationsWorker } from './notifications.worker';

describe('NotificationsWorker', () => {
  it('does not claim messages when SMS is disabled', async () => {
    const notifications = { claimSms: jest.fn(), markSent: jest.fn(), markFailed: jest.fn() } as any;
    const provider = { status: () => ({ configured: false }), send: jest.fn() } as any;
    const worker = new NotificationsWorker(notifications, provider);
    await worker.process();
    expect(notifications.claimSms).not.toHaveBeenCalled();
  });

  it('sends claimed SMS and persists provider acknowledgement', async () => {
    const notifications = {
      claimSms: jest.fn().mockResolvedValue([{
        id: 'sms-1', recipient: '255712345678', payload: { message: 'Receipt' }, attempts: 1, dedupeKey: 'receipt-1',
      }]),
      markSent: jest.fn().mockResolvedValue({ status: 'SENT' }),
      markFailed: jest.fn(),
    } as any;
    const provider = {
      status: () => ({ configured: true }),
      send: jest.fn().mockResolvedValue({ providerMessageId: 'beem-123', accepted: true }),
    } as any;
    const worker = new NotificationsWorker(notifications, provider);
    await worker.process();
    expect(provider.send).toHaveBeenCalledWith('255712345678', 'Receipt', 'receipt-1');
    expect(notifications.markSent).toHaveBeenCalledWith('sms-1', 'beem-123');
    expect(notifications.markFailed).not.toHaveBeenCalled();
  });

  it('requeues provider failures with a bounded retry delay', async () => {
    const notifications = {
      claimSms: jest.fn().mockResolvedValue([{
        id: 'sms-2', recipient: '255712345678', payload: { message: 'Receipt' }, attempts: 3, dedupeKey: 'receipt-2',
      }]),
      markSent: jest.fn(),
      markFailed: jest.fn(),
    } as any;
    const provider = { status: () => ({ configured: true }), send: jest.fn().mockRejectedValue(new Error('provider timeout')) } as any;
    const worker = new NotificationsWorker(notifications, provider);
    await worker.process();
    expect(notifications.markFailed).toHaveBeenCalledWith('sms-2', 'provider timeout', 60);
    expect(notifications.markSent).not.toHaveBeenCalled();
  });
});
