import { Injectable } from '@nestjs/common';
import { NetworkCredentials } from '../../common/secure-network-credentials';
import { RadiusService } from '../../radius/radius.service';
import { MikroTikTrafficEnforcementAdapter } from './mikrotik.adapter';
import { NetworkDeviceAdapterRegistry } from './network-device.adapter';
import { BandwidthEnforcementCommand, NetworkDisconnectCommand } from './enforcement.adapter';

export type NetworkCapability =
  | 'DEVICE.HEALTH' | 'DEVICE.IDENTITY' | 'DEVICE.CONFIGURATION' | 'DEVICE.REBOOT' | 'DEVICE.INTERFACES'
  | 'SESSION.LIST' | 'SESSION.INSPECT' | 'SESSION.DISCONNECT'
  | 'SUBSCRIBER.PROVISION' | 'SUBSCRIBER.SUSPEND' | 'SUBSCRIBER.ACTIVATE' | 'SUBSCRIBER.INSPECT'
  | 'BANDWIDTH.INSPECT' | 'BANDWIDTH.LIMIT' | 'BANDWIDTH.RESTORE'
  | 'HOTSPOT.USERS' | 'HOTSPOT.SESSIONS' | 'HOTSPOT.VOUCHERS' | 'HOTSPOT.PROFILES'
  | 'PPPOE.SESSIONS' | 'PPPOE.USERS' | 'PPPOE.PROFILES';

export type NetworkProvider =
  | 'MIKROTIK' | 'OMADA' | 'OPENWRT' | 'OPNSENSE' | 'FREERADIUS' | 'OPENNDS' | 'PACKETFENCE';

export type NetworkCapabilityRisk = 'READ_ONLY' | 'LOW_RISK' | 'MODERATE_RISK' | 'HIGH_RISK' | 'DESTRUCTIVE';

export type CapabilityInputMap = {
  'DEVICE.HEALTH': { routerId?: string };
  'DEVICE.IDENTITY': { routerId?: string };
  'DEVICE.CONFIGURATION': { routerId?: string; configuration?: Record<string, unknown> };
  'DEVICE.REBOOT': { routerId?: string; reason?: string };
  'DEVICE.INTERFACES': { routerId?: string };
  'SESSION.LIST': { routerId?: string; endpoint?: string };
  'SESSION.INSPECT': { routerId?: string; sessionId?: string; username?: string };
  'SESSION.DISCONNECT': NetworkDisconnectCommand;
  'SUBSCRIBER.PROVISION': { routerId?: string; customerId: string; profile?: string };
  'SUBSCRIBER.SUSPEND': { routerId?: string; customerId: string; reason?: string };
  'SUBSCRIBER.ACTIVATE': { routerId?: string; customerId: string };
  'SUBSCRIBER.INSPECT': { routerId?: string; customerId: string };
  'BANDWIDTH.INSPECT': { routerId?: string; customerId?: string; sessionId?: string };
  'BANDWIDTH.LIMIT': BandwidthEnforcementCommand[];
  'BANDWIDTH.RESTORE': BandwidthEnforcementCommand[];
  'HOTSPOT.USERS': { routerId?: string; endpoint?: string };
  'HOTSPOT.SESSIONS': { routerId?: string; endpoint?: string };
  'HOTSPOT.VOUCHERS': { routerId?: string; profile?: string };
  'HOTSPOT.PROFILES': { routerId?: string };
  'PPPOE.SESSIONS': { routerId?: string; endpoint?: string };
  'PPPOE.USERS': { routerId?: string; username?: string };
  'PPPOE.PROFILES': { routerId?: string };
};

export type CapabilityInput<C extends NetworkCapability> = CapabilityInputMap[C];

export interface CapabilityCommandSchema<I = unknown, O = unknown> {
  capability: NetworkCapability;
  command: string;
  risk: NetworkCapabilityRisk;
  permission: string;
  timeoutMs: number;
  input: string;
  output: string;
  readonly _input?: I;
  readonly _output?: O;
}

export interface CapabilityContext {
  tenantId: string;
  routerId?: string;
  credentials?: NetworkCredentials;
  correlationId?: string;
  permissions: string[];
}

export interface ProviderExecutionResult<T = unknown> {
  provider: NetworkProvider;
  capability: NetworkCapability;
  command: string;
  status: 'EXECUTED' | 'VERIFIED' | 'FAILED' | 'UNAVAILABLE';
  confirmed: boolean;
  data?: T;
  providerReference?: string;
  error?: {
    code: ProviderErrorCode;
    message: string;
    retryable: boolean;
    provider?: NetworkProvider;
    operation?: string;
  };
}

export type ProviderErrorCode =
  | 'UNSUPPORTED_CAPABILITY'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_REJECTED'
  | 'PROVIDER_INVALID_RESPONSE'
  | 'PROVIDER_AUTHENTICATION_FAILED'
  | 'PROVIDER_NETWORK_ERROR'
  | 'PROVIDER_EXECUTION_UNCONFIRMED'
  | 'UNAUTHORIZED';

export class TypedProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly provider?: NetworkProvider,
    public readonly operation?: string,
  ) {
    super(message);
    this.name = 'TypedProviderError';
  }
}

export function normalizeProviderError(
  error: unknown,
  provider?: NetworkProvider,
  operation?: string,
): TypedProviderError {
  if (error instanceof TypedProviderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const code: ProviderErrorCode =
    lower.includes('timeout') || lower.includes('timed out')
      ? 'PROVIDER_TIMEOUT'
      : lower.includes('credential') || lower.includes('unauthorized') || lower.includes('authentication')
        ? 'PROVIDER_AUTHENTICATION_FAILED'
        : lower.includes('invalid') || lower.includes('malformed')
          ? 'PROVIDER_INVALID_RESPONSE'
          : lower.includes('unsupported') || lower.includes('not supported')
            ? 'UNSUPPORTED_CAPABILITY'
            : lower.includes('unavailable')
              ? 'PROVIDER_UNAVAILABLE'
              : 'PROVIDER_NETWORK_ERROR';
  return new TypedProviderError(code, message.slice(0, 1000), code === 'PROVIDER_TIMEOUT' || code === 'PROVIDER_NETWORK_ERROR', provider, operation);
}

export interface NetworkCapabilityAdapter {
  readonly provider: NetworkProvider;
  discover(): CapabilityCommandSchema[];
  execute<C extends NetworkCapability, T = unknown>(
    capability: C,
    command: string,
    input: CapabilityInput<C>,
    context: CapabilityContext,
  ): Promise<ProviderExecutionResult<T>>;
    capability: NetworkCapability,
    command: string,
    input: unknown,
    context: CapabilityContext,
  ): Promise<ProviderExecutionResult<T>>;
}

interface HotspotSession {
  username?: string;
  address?: string;
  macAddress?: string;
  bytesIn: string;
  bytesOut: string;
}

const schemas: CapabilityCommandSchema[] = [
  ['DEVICE.HEALTH','device.health','READ_ONLY','network.device.read'],
  ['DEVICE.IDENTITY','device.identity','READ_ONLY','network.device.read'],
  ['DEVICE.CONFIGURATION','device.configuration','MODERATE_RISK','network.device.configure'],
  ['DEVICE.REBOOT','device.reboot','DESTRUCTIVE','network.device.reboot'],
  ['DEVICE.INTERFACES','device.interfaces','READ_ONLY','network.device.read'],
  ['SESSION.LIST','session.list','READ_ONLY','network.session.read'],
  ['SESSION.INSPECT','session.inspect','READ_ONLY','network.session.read'],
  ['SESSION.DISCONNECT','session.disconnect','HIGH_RISK','network.session.disconnect'],
  ['SUBSCRIBER.PROVISION','subscriber.provision','MODERATE_RISK','network.subscriber.write'],
  ['SUBSCRIBER.SUSPEND','subscriber.suspend','HIGH_RISK','network.subscriber.write'],
  ['SUBSCRIBER.ACTIVATE','subscriber.activate','MODERATE_RISK','network.subscriber.write'],
  ['SUBSCRIBER.INSPECT','subscriber.inspect','READ_ONLY','network.subscriber.read'],
  ['BANDWIDTH.INSPECT','bandwidth.inspect','READ_ONLY','network.bandwidth.read'],
  ['BANDWIDTH.LIMIT','bandwidth.limit','HIGH_RISK','network.bandwidth.write'],
  ['BANDWIDTH.RESTORE','bandwidth.restore','MODERATE_RISK','network.bandwidth.write'],
  ['HOTSPOT.USERS','hotspot.users','READ_ONLY','network.hotspot.read'],
  ['HOTSPOT.SESSIONS','hotspot.sessions','READ_ONLY','network.hotspot.read'],
  ['HOTSPOT.VOUCHERS','hotspot.vouchers','MODERATE_RISK','network.hotspot.write'],
  ['HOTSPOT.PROFILES','hotspot.profiles','MODERATE_RISK','network.hotspot.write'],
  ['PPPOE.SESSIONS','pppoe.sessions','READ_ONLY','network.pppoe.read'],
  ['PPPOE.USERS','pppoe.users','MODERATE_RISK','network.pppoe.write'],
  ['PPPOE.PROFILES','pppoe.profiles','MODERATE_RISK','network.pppoe.write'],
].map(([capability, command, risk, permission]) => ({
  capability: capability as NetworkCapability,
  command,
  risk: risk as NetworkCapabilityRisk,
  permission,
  timeoutMs: 5000,
  input: 'typed capability input',
  output: 'typed provider-normalized output',
}));

class StaticUnsupportedAdapter implements NetworkCapabilityAdapter {
  constructor(public readonly provider: NetworkProvider) {}
  discover(): CapabilityCommandSchema[] { return []; }
  async execute<T = unknown>(capability: NetworkCapability, command: string): Promise<ProviderExecutionResult<T>> {
    const error = new TypedProviderError('UNSUPPORTED_CAPABILITY', `${this.provider} does not expose ${capability}/${command}`, false, this.provider, command);
    return { provider: this.provider, capability, command, status: 'UNAVAILABLE', confirmed: false, error };
  }
}

@Injectable()
export class MikroTikCapabilityAdapter implements NetworkCapabilityAdapter {
  readonly provider = 'MIKROTIK' as const;
  constructor(private readonly traffic: MikroTikTrafficEnforcementAdapter) {}
  discover(): CapabilityCommandSchema[] {
    return schemas.filter((s) => ['SESSION.LIST','SESSION.INSPECT','SESSION.DISCONNECT','BANDWIDTH.LIMIT','BANDWIDTH.RESTORE','HOTSPOT.SESSIONS'].includes(s.capability));
  }
  async execute<C extends NetworkCapability, T = unknown>(capability: C, command: string, input: CapabilityInput<C>, context: CapabilityContext): Promise<ProviderExecutionResult<T>> {
    try {
      if (capability === 'HOTSPOT.SESSIONS' || capability === 'SESSION.LIST') {
        const value = await this.traffic.readHotspotActive(String((input as { endpoint?: string }).endpoint ?? ''), context.credentials);
        return { provider: this.provider, capability, command, status: 'VERIFIED', confirmed: true, data: value as T };
      }
      if (capability === 'SESSION.DISCONNECT') {
        const value = await this.traffic.disconnect([input as NetworkDisconnectCommand], context.credentials);
        const result = value[0];
        if (!result?.disconnected) {
          return { provider: this.provider, capability, command, status: 'FAILED', confirmed: false, data: result as T,
            error: { code: 'PROVIDER_EXECUTION_UNCONFIRMED', message: 'Provider did not confirm a disconnected session', retryable: false, provider: this.provider, operation: command } };
        }
        return { provider: this.provider, capability, command, status: 'EXECUTED', confirmed: true, data: result as T };
      }
      if (capability === 'BANDWIDTH.LIMIT' || capability === 'BANDWIDTH.RESTORE') {
        const typed = input as BandwidthEnforcementCommand[];
        await this.traffic.apply(typed, context.credentials);
        if (!this.traffic.verify) throw new TypedProviderError('PROVIDER_EXECUTION_UNCONFIRMED','MikroTik bandwidth adapter has no verification contract',false,this.provider,command);
        const verification = await this.traffic.verify(typed, context.credentials);
        const verified = verification.length === typed.length && verification.every((item) => item.verified);
        return { provider: this.provider, capability, command, status: verified ? 'VERIFIED' : 'FAILED', confirmed: verified, data: verification as T,
          ...(verified ? {} : { error: { code: 'PROVIDER_EXECUTION_UNCONFIRMED' as const, message: 'MikroTik provider did not confirm the requested bandwidth state', retryable: false, provider: this.provider, operation: command } }) };
      }
      return new StaticUnsupportedAdapter(this.provider).execute<T>(capability, command, input, context);
    } catch (error) {
      const normalized = normalizeProviderError(error, this.provider, command);
      return { provider: this.provider, capability, command, status: 'FAILED', confirmed: false,
        error: { code: normalized.code, message: normalized.message, retryable: normalized.retryable, provider: this.provider, operation: command } };
    }
  }
}

@Injectable()
export class OpenWrtCapabilityAdapter implements NetworkCapabilityAdapter {
  readonly provider = 'OPENWRT' as const;
  constructor(private readonly devices: NetworkDeviceAdapterRegistry) {}
  discover(): CapabilityCommandSchema[] {
    return schemas.filter((s) => s.capability === 'HOTSPOT.SESSIONS' || s.capability === 'HOTSPOT.USERS');
  }
  async execute<C extends NetworkCapability, T = unknown>(capability: C, command: string, input: CapabilityInput<C>, context: CapabilityContext): Promise<ProviderExecutionResult<T>> {
    try {
      if (!['HOTSPOT.SESSIONS','HOTSPOT.USERS'].includes(capability)) return new StaticUnsupportedAdapter(this.provider).execute<T>(capability, command, input, context);
      const connection = { routerId: context.routerId ?? 'unknown', protocol: 'OPENWRT_UBUS' as const, endpoint: (input as { endpoint?: string }).endpoint, credentials: context.credentials };
      const data = await this.devices.readClients(connection) as HotspotSession[];
      return { provider: this.provider, capability, command, status: 'VERIFIED', confirmed: true, data: data as T };
    } catch (error) {
      const normalized = normalizeProviderError(error, this.provider, command);
      return { provider: this.provider, capability, command, status: 'FAILED', confirmed: false,
        error: { code: normalized.code, message: normalized.message, retryable: normalized.retryable, provider: this.provider, operation: command } };
    }
  }
}

@Injectable()
export class FreeRadiusCapabilityAdapter implements NetworkCapabilityAdapter {
  readonly provider = 'FREERADIUS' as const;
  constructor(private readonly radius: RadiusService) {}
  discover(): CapabilityCommandSchema[] {
    return schemas.filter((s) => s.capability === 'SESSION.DISCONNECT');
  }
  async execute<C extends NetworkCapability, T = unknown>(capability: C, command: string, input: CapabilityInput<C>, context: CapabilityContext): Promise<ProviderExecutionResult<T>> {
    try {
      if (capability !== 'SESSION.DISCONNECT') return new StaticUnsupportedAdapter(this.provider).execute<T>(capability, command, input, context);
      const data = await this.radius.disconnectSession(context.tenantId, input as never);
      const confirmed = data.accepted === true;
      return { provider: this.provider, capability, command, status: confirmed ? 'VERIFIED' : 'FAILED', confirmed, data: data as T,
        ...(confirmed ? {} : { error: { code: 'PROVIDER_REJECTED' as const, message: 'RADIUS NAS returned Disconnect-NAK', retryable: false, provider: this.provider, operation: command } }) };
    } catch (error) {
      const normalized = normalizeProviderError(error, this.provider, command);
      return { provider: this.provider, capability, command, status: 'FAILED', confirmed: false,
        error: { code: normalized.code, message: normalized.message, retryable: normalized.retryable, provider: this.provider, operation: command } };
    }
  }
}

@Injectable()
export class NetworkCapabilityRegistry {
  private readonly adapters = new Map<NetworkProvider, NetworkCapabilityAdapter>();
  private readonly knownProviders: NetworkProvider[] = ['MIKROTIK','OMADA','OPENWRT','OPNSENSE','FREERADIUS','OPENNDS','PACKETFENCE'];

  constructor(
    mikrotik: MikroTikCapabilityAdapter,
    openwrt: OpenWrtCapabilityAdapter,
    freeradius: FreeRadiusCapabilityAdapter,
  ) {
    this.register(mikrotik);
    this.register(openwrt);
    this.register(freeradius);
    for (const provider of this.knownProviders) if (!this.adapters.has(provider)) this.register(new StaticUnsupportedAdapter(provider));
  }

  register(adapter: NetworkCapabilityAdapter): void { this.adapters.set(adapter.provider, adapter); }

  providers(): NetworkProvider[] { return [...this.knownProviders]; }

  supportedCapabilities(provider: NetworkProvider): NetworkCapability[] {
    return this.adapters.get(provider)?.discover().map((schema) => schema.capability) ?? [];
  }

  discover(provider?: NetworkProvider) {
    const providers = provider ? [provider] : this.knownProviders;
    return providers.map((name) => {
      const adapter = this.adapters.get(name)!;
      return { provider: name, supportedCapabilities: adapter.discover().map((schema) => ({ ...schema })), executionAdapter: adapter.constructor.name };
    });
  }

  schema(provider: NetworkProvider, capability: NetworkCapability, command: string): CapabilityCommandSchema | undefined {
    return this.adapters.get(provider)?.discover().find((schema) => schema.capability === capability && schema.command === command);
  }

  async execute<C extends NetworkCapability, T = unknown>(provider: NetworkProvider, capability: C, command: string, input: CapabilityInput<C>, context: CapabilityContext): Promise<ProviderExecutionResult<T>> {
    const schema = this.schema(provider, capability, command);
    if (!schema) return new StaticUnsupportedAdapter(provider).execute<T>(capability, command, input, context);
    if (!context.tenantId.trim()) {
      const error = new TypedProviderError('UNAUTHORIZED', 'Tenant scope is required for provider execution', false, provider, command);
      return { provider, capability, command, status: 'FAILED', confirmed: false, error: { code: error.code, message: error.message, retryable: false, provider, operation: command } };
    }
    if (!context.permissions.includes(schema.permission) && !context.permissions.includes('*')) {
      const error = new TypedProviderError('UNAUTHORIZED', `Permission ${schema.permission} is required for ${command}`, false, provider, command);
      return { provider, capability, command, status: 'FAILED', confirmed: false, error: { code: error.code, message: error.message, retryable: false, provider, operation: command } };
    }
    return this.adapters.get(provider)!.execute<C, T>(capability, command, input, context);
  }
}
