export interface NetworkPolicySource {
  packageId: string;
  name?: string;
  durationSeconds: number;
  dataLimitBytes?: number | string | null;
  downloadBps?: number | string | null;
  uploadBps?: number | string | null;
}

export interface CompiledNetworkPolicy {
  version: 1;
  source: { packageId: string; packageName?: string };
  validity: { durationSeconds: number };
  quota: { dataLimitBytes: number | null };
  bandwidth: { downloadBps: number | null; uploadBps: number | null };
  session: { sessionTimeoutSeconds: number; interimUpdateSeconds: number };
  capabilities: {
    quotaEnforcement: boolean;
    bandwidthEnforcement: boolean;
    sessionTimeout: boolean;
    interimAccounting: boolean;
    coaCompatible: boolean;
  };
}

function finiteInteger(value: unknown, fallback: number | null = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.trunc(number);
}

/**
 * Converts a commercial WiFi plan into a stable network policy snapshot.
 * No router/vendor commands are emitted here. Adapters consume this contract.
 */
export function compileNetworkPolicy(source: NetworkPolicySource): CompiledNetworkPolicy {
  const durationSeconds = finiteInteger(source.durationSeconds, null);
  if (!source.packageId || durationSeconds === null || durationSeconds <= 0) {
    throw new Error('A network policy requires a valid packageId and positive durationSeconds');
  }

  const dataLimitBytes = finiteInteger(source.dataLimitBytes);
  const downloadBps = finiteInteger(source.downloadBps);
  const uploadBps = finiteInteger(source.uploadBps);

  return {
    version: 1,
    source: { packageId: source.packageId, packageName: source.name },
    validity: { durationSeconds },
    quota: { dataLimitBytes },
    bandwidth: { downloadBps, uploadBps },
    session: {
      sessionTimeoutSeconds: durationSeconds,
      interimUpdateSeconds: Math.min(300, Math.max(30, Math.trunc(durationSeconds / 20) || 30)),
    },
    capabilities: {
      quotaEnforcement: dataLimitBytes !== null,
      bandwidthEnforcement: downloadBps !== null || uploadBps !== null,
      sessionTimeout: true,
      interimAccounting: true,
      coaCompatible: downloadBps !== null || uploadBps !== null,
    },
  };
}

export interface RadiusPolicyAttributes {
  'Session-Timeout': number;
  'Acct-Interim-Interval': number;
  'Mikrotik-Rate-Limit'?: string;
}

/** Translate only policy fields with unambiguous RADIUS/MikroTik semantics. */
export function toRadiusPolicyAttributes(policy: CompiledNetworkPolicy): RadiusPolicyAttributes {
  const attributes: RadiusPolicyAttributes = {
    'Session-Timeout': policy.session.sessionTimeoutSeconds,
    'Acct-Interim-Interval': policy.session.interimUpdateSeconds,
  };

  const down = policy.bandwidth.downloadBps;
  const up = policy.bandwidth.uploadBps;
  if (down !== null || up !== null) {
    const downKbps = Math.max(1, Math.round((down ?? up ?? 0) / 1000));
    const upKbps = Math.max(1, Math.round((up ?? down ?? 0) / 1000));
    attributes['Mikrotik-Rate-Limit'] = `${upKbps}k/${downKbps}k`;
  }
  return attributes;
}
