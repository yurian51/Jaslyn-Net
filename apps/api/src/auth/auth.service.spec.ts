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
});
