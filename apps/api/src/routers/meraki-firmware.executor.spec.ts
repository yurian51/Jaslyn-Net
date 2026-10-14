import { BadRequestException } from '@nestjs/common';
import { MerakiFirmwareExecutor } from './meraki-firmware.executor';

describe('MerakiFirmwareExecutor', () => {
  const credentials = { apiKey: 'meraki-api-key-value', networkId: 'N_123456789', productType: 'wireless' };
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  it('reads current and compatible versions from the official network firmware endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      timezone: 'Africa/Dar_es_Salaam', products: { wireless: {
        currentVersion: { id: 'v1', firmware: 'MR 30.1' },
        availableVersions: [{ id: 'v2', firmware: 'MR 31.1', shortName: 'MR 31.1' }],
        isUpgradeAvailable: true, nextUpgrade: null,
      } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const result = await new MerakiFirmwareExecutor().inspect(credentials);
    expect(result.currentVersion?.id).toBe('v1');
    expect(result.availableVersions).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith('https://api.meraki.com/api/v1/networks/N_123456789/firmwareUpgrades', expect.objectContaining({
      method: 'GET', redirect: 'error',
      headers: expect.objectContaining({ 'X-Cisco-Meraki-API-Key': credentials.apiKey }),
    }));
  });

  it('refuses versions not listed by the network before sending any mutation', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ products: { wireless: {
      currentVersion: { id: 'v1' }, availableVersions: [], nextUpgrade: null,
    } } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(new MerakiFirmwareExecutor().scheduleUpgrade(credentials, {
      targetVersion: 'unlisted', scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      timezone: 'Africa/Dar_es_Salaam', approved: true,
    })).rejects.toThrow('not listed as available');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('requires explicit approval and a future schedule', async () => {
    const executor = new MerakiFirmwareExecutor();
    await expect(executor.scheduleUpgrade(credentials, {
      targetVersion: 'v2', scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      timezone: 'Africa/Dar_es_Salaam', approved: false as true,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('schedules only an exact available target and preserves other product schedules', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ timezone: 'Africa/Dar_es_Salaam', upgradeWindow: { dayOfWeek: 'sun', hourOfDay: '3:00' }, products: {
        wireless: { currentVersion: { id: 'v1' }, availableVersions: [{ id: 'v2', firmware: 'MR 31.1' }], nextUpgrade: { time: '2026-12-01T01:00:00Z', toVersion: { id: 'v1' } } },
        appliance: { currentVersion: { id: 'mx1' }, availableVersions: [], nextUpgrade: { time: '2026-12-02T01:00:00Z', toVersion: { id: 'mx1' } } },
      } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockImplementationOnce(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.products.appliance.nextUpgrade.toVersion.id).toBe('mx1');
        expect(body.products.wireless.nextUpgrade.toVersion.id).toBe('v2');
        return new Response(JSON.stringify({ products: {
          wireless: { nextUpgrade: { time: body.products.wireless.nextUpgrade.time, toVersion: { id: 'v2' } },
            currentVersion: { id: 'v1' }, availableVersions: [{ id: 'v2' }] },
          appliance: { nextUpgrade: { time: '2026-12-02T01:00:00Z', toVersion: { id: 'mx1' } } },
        } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });
    global.fetch = fetchMock as typeof fetch;
    const result = await new MerakiFirmwareExecutor().scheduleUpgrade(credentials, {
      targetVersion: 'v2', scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      timezone: 'Africa/Dar_es_Salaam', approved: true,
    });
    expect(result.status).toBe('SCHEDULED');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
