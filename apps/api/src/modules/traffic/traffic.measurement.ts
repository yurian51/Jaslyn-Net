export interface TrafficCounterSample {
  bytesIn: number;
  bytesOut: number;
  sampledAt: Date;
}

export interface ThroughputSample {
  downloadMbps: number;
  uploadMbps: number;
  totalMbps: number;
  intervalSeconds: number;
}

export function calculateThroughput(previous: TrafficCounterSample, current: TrafficCounterSample): ThroughputSample {
  const intervalMs = current.sampledAt.getTime() - previous.sampledAt.getTime();
  const intervalSeconds = intervalMs > 0 ? intervalMs / 1000 : 0;
  if (intervalSeconds <= 0) {
    return { downloadMbps: 0, uploadMbps: 0, totalMbps: 0, intervalSeconds: 0 };
  }

  const inDelta = Math.max(0, current.bytesIn - previous.bytesIn);
  const outDelta = Math.max(0, current.bytesOut - previous.bytesOut);
  const bytesToMbps = (bytes: number) => (bytes * 8) / intervalSeconds / 1_000_000;
  const downloadMbps = bytesToMbps(inDelta);
  const uploadMbps = bytesToMbps(outDelta);

  return {
    downloadMbps: Number(downloadMbps.toFixed(3)),
    uploadMbps: Number(uploadMbps.toFixed(3)),
    totalMbps: Number((downloadMbps + uploadMbps).toFixed(3)),
    intervalSeconds,
  };
}
