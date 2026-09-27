import { ServiceUnavailableException } from '@nestjs/common';
import { CommunicationAttachmentService } from './communication.attachments';

describe('CommunicationAttachmentService', () => {
  it('fails closed when private object storage is not configured', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id:'att-1' }] }) } as any;
    const config = { get: jest.fn((key: string) => key === 'ATTACHMENT_SCAN_REQUIRED' ? 'true' : undefined) } as any;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const communication = {
      assertMessageAccess: jest.fn().mockResolvedValue({ id:'msg-1' }),
    } as any;
    const service = new CommunicationAttachmentService(db, config, audit, communication);

    await expect(service.createUpload(
      { userId:'u1',tenantId:'t1',role:'OWNER' },
      'msg-1',
      { fileName:'document.pdf',mimeType:'application/pdf',sizeBytes:1024 },
    )).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
