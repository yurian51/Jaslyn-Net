export interface TrafficCounterSample {
  bytesIn: string | number;
  bytesOut: string | number;
  sampledAt: Date;
}

export interface ThroughputSample {
  downloadMbps: number;
  uploadMbps: number;
  totalMbps: number;
  intervalSeconds: number;
}

function counterDelta(current: string | number, previous: string | number): bigint {
  const currentValue = BigInt(current);
  const previousValue = BigInt(previous);
  return currentValue > previousValue ? currentValue - previousValue : 0n;
}

export function calculateThroughput(previous: TrafficCounterSample, current: TrafficCounterSample): ThroughputSample {
  const intervalMs = current.sampledAt.getTime() - previous.sampledAt.getTime();
  const intervalSeconds = intervalMs > 0 ? intervalMs / 1000 : 0;
  if (intervalSeconds <= 0) return { downloadMbps: 0, uploadMbps: 0, totalMbps: 0, intervalSeconds: 0 };

  const inDelta = counterDelta(current.bytesIn, previous.bytesIn);
  const outDelta = counterDelta(current.bytesOut, previous.bytesOut);
  const bytesToMbps = (bytes: bigint) => Number(bytes) * 8 / intervalSeconds / 1_000_000;
  const downloadMbps = bytesToMbps(inDelta);
  const uploadMbps = bytesToMbps(outDelta);

  return {
    downloadMbps: Number(downloadMbps.toFixed(3)),
    uploadMbps: Number(uploadMbps.toFixed(3)),
    totalMbps: Number((downloadMbps + uploadMbps).toFixed(3)),
    intervalSeconds,
  };
}
