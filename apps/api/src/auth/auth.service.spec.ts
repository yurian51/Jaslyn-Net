import { AuthService } from './auth.service';

describe('AuthService legal acceptance', () => {
  function createService() {
    const db = { connect: jest.fn() } as any;
    const config = { get: jest.fn().mockReturnValue('x'.repeat(64)) } as any;
    return { service: new AuthService(db, config), db };
  }

  it('rejects registration when current terms or privacy notice is not accepted', async () => {
    const { service, db } = createService();

    await expect(service.register({
      businessName: 'Example ISP',
      fullName: 'Operator One',
      email: 'operator@example.com',
      password: 'a'.repeat(12),
      acceptTerms: true,
      acceptPrivacy: false,
    })).rejects.toThrow('Acceptance of the current Terms of Use and Privacy Notice is required');

    expect(db.connect).not.toHaveBeenCalled();
  });

  it('persists versioned legal acceptance records in the registration transaction', async () => {
    const { service, db } = createService();
    (service as any).hashPassword = jest.fn().mockResolvedValue('scrypt$test$hash');
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ id: 'tenant-1', name: 'Example ISP', slug: 'example-isp', status: 'TRIAL', currency: 'TZS', timezone: 'Africa/Dar_es_Salaam' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', tenant_id: 'tenant-1', email: 'operator@example.com', full_name: 'Operator One', role: 'OWNER' }] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined),
      release: jest.fn(),
    };
    db.connect.mockResolvedValue(client);

    const result = await service.register({
      businessName: 'Example ISP',
      fullName: 'Operator One',
      email: 'operator@example.com',
      password: 'a'.repeat(12),
      acceptTerms: true,
      acceptPrivacy: true,
    }, { ip: '192.0.2.10', userAgent: 'TestAgent/1.0' });

    expect(result.user.email).toBe('operator@example.com');
    expect(client.query.mock.calls[3]).toEqual([
      expect.stringContaining("INSERT INTO legal_acceptances"),
      ['tenant-1', 'user-1', '2026-09-18', '192.0.2.10', 'TestAgent/1.0', '2026-09-18'],
    ]);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });
  it('records the current legal version idempotently for an authenticated user', async () => {
    const { service, db } = createService();
    db.query = jest.fn().mockResolvedValue({ rows: [] });

    await expect((service as any).acceptLegalDocument(
      { id: 'user-1', tenantId: 'tenant-1', role: 'OWNER', email: 'operator@example.com' },
      'TERMS_OF_USE',
      { ip: '192.0.2.11', userAgent: 'TestAgent/2.0' },
    )).resolves.toEqual({
      documentType: 'TERMS_OF_USE',
      documentVersion: '2026-09-18',
      accepted: true,
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (tenant_id, user_id, document_type, document_version) DO NOTHING'),
      ['tenant-1', 'user-1', 'TERMS_OF_USE', '2026-09-18', '192.0.2.11', 'TestAgent/2.0'],
    );
  });

  it('returns current and accepted legal versions without crossing tenant boundaries', async () => {
    const { service, db } = createService();
    db.query = jest.fn().mockResolvedValue({
      rows: [{ document_type: 'TERMS_OF_USE', document_version: '2026-09-18', accepted_at: '2026-09-18T10:00:00.000Z' }],
    });

    await expect((service as any).getLegalAcceptanceStatus(
      { id: 'user-1', tenantId: 'tenant-1', role: 'OWNER', email: 'operator@example.com' },
    )).resolves.toEqual({
      documents: [
        { documentType: 'TERMS_OF_USE', currentVersion: '2026-09-18', acceptedVersion: '2026-09-18', acceptedAt: '2026-09-18T10:00:00.000Z', current: true },
        { documentType: 'PRIVACY_NOTICE', currentVersion: '2026-09-18', acceptedVersion: null, acceptedAt: null, current: false },
      ],
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE tenant_id = $1 AND user_id = $2'),
      ['tenant-1', 'user-1'],
    );
  });
});
