import { BadRequestException } from '@nestjs/common';
import { MikroTikFirmwareExecutor } from './mikrotik-firmware.executor';

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as Response;
}

describe('MikroTikFirmwareExecutor', () => {
  const fetchMock = jest.fn();
  const connection = { endpoint: 'https://router.example/rest', credentials: { username: 'jaslyn', password: 'secret' } };
  const resource = [{ 'board-name': 'hAP ax3', 'architecture-name': 'arm64', version: '7.16.2' }];
  const board = [{ 'board-name': 'C53UiG+5HPaxD2HPaxD', model: 'hAP ax3', 'factory-firmware': '7.10' }];
  const updateCheck = [{ status: 'Connecting' }, { status: 'New version is available', 'latest-version': '7.17.1' }];
  const updatePrint = [{ channel: 'stable', 'installed-version': '7.16.2', 'latest-version': '7.17.1', status: 'New version is available' }];

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as any;
  });

  it('reads live RouterOS identity and checks the official update channel', async () => {
    fetchMock
      .mockResolvedValueOnce(response(resource))
      .mockResolvedValueOnce(response(board))
      .mockResolvedValueOnce(response(updateCheck))
      .mockResolvedValueOnce(response(updatePrint));
    const executor = new MikroTikFirmwareExecutor();
    await expect(executor.inspect(connection)).resolves.toMatchObject({
      identity: { model: 'hAP ax3', architecture: 'arm64', version: '7.16.2' },
      update: { installedVersion: '7.16.2', latestVersion: '7.17.1', channel: 'stable' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][0]).toBe('https://router.example/rest/system/package/update/check-for-updates');
    expect(fetchMock.mock.calls[2][1].method).toBe('POST');
    expect(fetchMock.mock.calls.every((call) => call[1].redirect === 'manual')).toBe(true);
  });

  it('exports configuration in chunks and removes the temporary file', async () => {
    fetchMock
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([{ data: '/system identity set name=router' }]))
      .mockResolvedValueOnce(response([]));
    const executor = new MikroTikFirmwareExecutor();
    const result = await executor.createConfigurationExport(connection);
    expect(result.content).toBe('/system identity set name=router');
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fetchMock.mock.calls[0][0]).toBe('https://router.example/rest/export');
    expect(fetchMock.mock.calls[1][0]).toBe('https://router.example/rest/file/read');
    expect(fetchMock.mock.calls[2][0]).toMatch(/^https:\/\/router\.example\/rest\/file\/jaslyn-fw-preupgrade-.*\.rsc$/);
    expect(fetchMock.mock.calls[2][1].method).toBe('DELETE');
  });

  it('refuses install when target does not match the vendor update server latest version', async () => {
    const executor = new MikroTikFirmwareExecutor();
    await expect(executor.install(connection, {
      approvedTargetVersion: '7.17.0', expectedInstalledVersion: '7.16.2',
      observedLatestVersion: '7.17.1', backupReceiptId: 'backup-1', backupSha256: 'a'.repeat(64),
      maintenanceWindowActive: true,
    })).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses install without a durable backup receipt', async () => {
    const executor = new MikroTikFirmwareExecutor();
    await expect(executor.install(connection, {
      approvedTargetVersion: '7.17.1', expectedInstalledVersion: '7.16.2',
      observedLatestVersion: '7.17.1', backupReceiptId: '', backupSha256: 'a'.repeat(64),
      maintenanceWindowActive: true,
    })).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not issue install if live installed version changed after approval', async () => {
    fetchMock
      .mockResolvedValueOnce(response([{ 'board-name': 'hAP ax3', 'architecture-name': 'arm64', version: '7.16.3' }]))
      .mockResolvedValueOnce(response(board))
      .mockResolvedValueOnce(response(updateCheck))
      .mockResolvedValueOnce(response([{ channel: 'stable', 'installed-version': '7.16.3', 'latest-version': '7.17.1', status: 'New version is available' }]));
    const executor = new MikroTikFirmwareExecutor();
    await expect(executor.install(connection, {
      approvedTargetVersion: '7.17.1', expectedInstalledVersion: '7.16.2',
      observedLatestVersion: '7.17.1', backupReceiptId: 'backup-1', backupSha256: 'a'.repeat(64),
      maintenanceWindowActive: true,
    })).rejects.toThrow('installed version changed');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/system/package/update/install'))).toBe(false);
  });

  it('issues install only after live version, target, maintenance and backup checks pass', async () => {
    fetchMock
      .mockResolvedValueOnce(response(resource))
      .mockResolvedValueOnce(response(board))
      .mockResolvedValueOnce(response(updateCheck))
      .mockResolvedValueOnce(response(updatePrint))
      .mockResolvedValueOnce(response([]));
    const executor = new MikroTikFirmwareExecutor();
    await expect(executor.install(connection, {
      approvedTargetVersion: '7.17.1', expectedInstalledVersion: '7.16.2',
      observedLatestVersion: '7.17.1', backupReceiptId: 'backup-1', backupSha256: 'a'.repeat(64),
      maintenanceWindowActive: true,
    })).resolves.toMatchObject({ accepted: true, targetVersion: '7.17.1', backupReceiptId: 'backup-1' });
    expect(fetchMock.mock.calls[4][0]).toBe('https://router.example/rest/system/package/update/install');
    expect(fetchMock.mock.calls[4][1].method).toBe('POST');
  });

  it('rejects insecure endpoints before sending credentials', async () => {
    const executor = new MikroTikFirmwareExecutor();
    await expect(executor.inspect({ ...connection, endpoint: 'http://router.example/rest' })).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
