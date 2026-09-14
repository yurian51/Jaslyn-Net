export type ServicePolicyState = 'ACTIVE' | 'QUOTA_EXCEEDED' | 'EXPIRED' | 'NO_ACTIVE_SERVICE';

export interface ServicePolicyInput {
  startsAt?: Date | null;
  endsAt?: Date | null;
  dataLimitBytes?: number | null;
  usedBytes: number;
  downloadBps?: number | null;
  uploadBps?: number | null;
  now?: Date;
}

export interface ServicePolicyDecision {
  state: ServicePolicyState;
  maxDownloadMbps: number;
  maxUploadMbps: number;
  remainingBytes: number | null;
}

export function resolveServicePolicy(input: ServicePolicyInput): ServicePolicyDecision {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return inactive();

  const startsAt = input.startsAt ? input.startsAt.getTime() : null;
  const endsAt = input.endsAt ? input.endsAt.getTime() : null;
  if (startsAt !== null && !Number.isFinite(startsAt)) return inactive();
  if (endsAt !== null && !Number.isFinite(endsAt)) return inactive();
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) return inactive();
  if (startsAt !== null && nowMs < startsAt) return inactive();
  if (endsAt !== null && nowMs >= endsAt) return expired();

  const usedBytes = Number.isFinite(input.usedBytes) && input.usedBytes >= 0 ? input.usedBytes : 0;
  const limit = input.dataLimitBytes == null ? null : Number(input.dataLimitBytes);
  if (limit !== null && (!Number.isFinite(limit) || limit < 0)) return inactive();
  if (limit !== null && usedBytes >= limit) {
    return { state: 'QUOTA_EXCEEDED', maxDownloadMbps: 0, maxUploadMbps: 0, remainingBytes: 0 };
  }

  const downloadMbps = bpsToMbps(input.downloadBps);
  const uploadMbps = bpsToMbps(input.uploadBps);
  return {
    state: 'ACTIVE',
    maxDownloadMbps: downloadMbps,
    maxUploadMbps: uploadMbps,
    remainingBytes: limit === null ? null : Math.max(0, limit - usedBytes),
  };
}

function bpsToMbps(value?: number | null): number {
  if (value == null) return Number.POSITIVE_INFINITY;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric / 1_000_000;
}

function inactive(): ServicePolicyDecision {
  return { state: 'NO_ACTIVE_SERVICE', maxDownloadMbps: 0, maxUploadMbps: 0, remainingBytes: null };
}

function expired(): ServicePolicyDecision {
  return { state: 'EXPIRED', maxDownloadMbps: 0, maxUploadMbps: 0, remainingBytes: 0 };
}
