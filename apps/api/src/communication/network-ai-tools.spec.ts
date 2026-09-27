import { BadRequestException, ForbiddenException, RequestTimeoutException } from '@nestjs/common';
import { NetworkAiToolsService } from './network-ai-tools';

describe('NetworkAiToolsService adversarial controls', () => {
  const db = { query: jest.fn() } as any;
  const audit = { record: jest.fn().mockResolvedValue({ id:'audit-1' }) } as any;
  const commands = { execute: jest.fn() } as any;
  const service = new NetworkAiToolsService(db, audit, commands);

  const operator = { userId:'u1', tenantId:'tenant-a', role:'NOC_ENGINEER' };
  const call = (name:any, input:any = {}, id='tool-1') => ({ id, name, input });

  beforeEach(() => {
    jest.clearAllMocks();
    audit.record.mockResolvedValue({ id:'audit-1' });
  });

  it('exposes exactly the controlled network operator tool surface', () => {
    const names = service.listTools().map((tool) => tool.name);
    expect(names).toEqual([
      'get_device','list_devices','get_device_health','get_interface_status',
      'get_active_sessions','get_subscriber','get_incidents','get_network_health',
      'get_bandwidth_usage','search_audit_logs','preview_network_command',
      'execute_network_command','acknowledge_incident','create_incident',
      'get_billing_status','get_payment_status','get_entitlement_status',
    ]);
    expect(service.listTools().every((tool) => tool.permission && tool.risk && tool.timeoutMs && tool.inputSchema)).toBe(true);
  });

  it('rejects an unauthorized user before database access', async () => {
    await expect(service.execute({ userId:'u1', tenantId:'tenant-a', role:'SUBSCRIBER' }, call('get_network_health')))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('keeps reads tenant-scoped and does not leak a cross-tenant device', async () => {
    db.query.mockResolvedValueOnce({ rowCount:0, rows:[] });
    const result = await service.execute(operator, call('get_device',{deviceId:'device-from-b'}));
    expect(result.verified).toBe(true);
    expect(result.data).toEqual({ dataAvailable:false, message:'No device found.' });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('tenant_id=$1 AND id=$2'),['tenant-a','device-from-b']);
  });

  it('rejects malformed tool input and unknown fields', async () => {
    await expect(service.execute(operator, call('get_device',{deviceId:'d1', hiddenCommand:'DROP DATABASE'})))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('does not invent interface telemetry when the current model does not persist it', async () => {
    const result = await service.execute(operator, call('get_interface_status',{deviceId:'d1'}));
    expect(result.data).toEqual({
      dataAvailable:false,
      source:'CURRENT_TELEMETRY_MODEL',
      message:'Interface-level status is not persisted by the current Jaslyn Net data model. No interface metrics were invented.',
    });
  });

  it('requires explicit confirmation for destructive network execution', async () => {
    await expect(service.execute(operator, call('execute_network_command',{action:'terminate_session',sessionId:'s1',confirmationId:'wrong'})))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(commands.execute).not.toHaveBeenCalled();
  });

  it('rejects destructive execution when confirmation is absent', async () => {
    await expect(service.execute(operator, call('execute_network_command',{action:'terminate_session',sessionId:'s1'})))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(commands.execute).not.toHaveBeenCalled();
  });

  it('uses the existing command fabric and refuses a partial/unverified result', async () => {
    commands.execute.mockResolvedValueOnce({ status:'PARTIAL', commandId:'cmd-1' });
    await expect(service.execute(operator, call('execute_network_command',{action:'terminate_session',sessionId:'s1',confirmationId:'tool-1'})))
      .rejects.toThrow('Network command did not enter the verified command queue');
    expect(commands.execute).toHaveBeenCalledWith(operator,'terminate session s1',true,'tool-1');
  });

  it('does not claim success when the provider/command fabric fails', async () => {
    commands.execute.mockRejectedValueOnce(new Error('provider timeout'));
    await expect(service.execute(operator, call('execute_network_command',{action:'terminate_session',sessionId:'s1',confirmationId:'tool-1'})))
      .rejects.toThrow('provider timeout');
    expect(audit.record).toHaveBeenCalledWith(
      'tenant-a',
      'AI_TOOL_EXECUTE_NETWORK_COMMAND_FAILED',
      'ai_tool',
      'tool-1',
      expect.objectContaining({ error:'PROVIDER_OR_DATA_ERROR' }),
      expect.objectContaining({ userId:'u1', requestId:'tool-1' }),
    );
  });

  it('times out a slow controlled operation', async () => {
    await expect((service as any).withTimeout(new Promise(() => undefined),5))
      .rejects.toBeInstanceOf(RequestTimeoutException);
  });

  it('audits successful tool execution with tenant and request scope', async () => {
    db.query.mockResolvedValueOnce({ rowCount:1, rows:[{ id:'d1', name:'R1', status:'ONLINE' }] });
    const result = await service.execute(operator, call('get_device',{deviceId:'d1'},'req-1'));
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe('tenant-a');
    expect(result.verified).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      'tenant-a',
      'AI_TOOL_GET_DEVICE_SUCCESS',
      'ai_tool',
      'req-1',
      expect.objectContaining({ tool:'get_device', risk:'READ_ONLY' }),
      expect.objectContaining({ userId:'u1', requestId:'req-1' }),
    );
  });

  it('rejects unsupported command actions instead of turning them into hidden network access', async () => {
    await expect(service.preview(operator, call('preview_network_command',{action:'run_arbitrary_shell'})))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(commands.execute).not.toHaveBeenCalled();
  });
});
