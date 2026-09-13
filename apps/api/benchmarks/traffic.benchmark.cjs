const { performance } = require('node:perf_hooks');
const { FairnessEngine } = require('../dist/modules/traffic/fairness.engine');
const { calculateThroughput } = require('../dist/modules/traffic/traffic.measurement');
const { toEnforcementCommands } = require('../dist/modules/traffic/enforcement.adapter');

const USER_COUNT = Number(process.env.BENCHMARK_USERS ?? 10_000);
const ITERATIONS = Number(process.env.BENCHMARK_ITERATIONS ?? 50);
const MAX_FAIRNESS_MS = Number(process.env.BENCHMARK_MAX_FAIRNESS_MS ?? 2_000);
const MAX_MEASUREMENT_MS = Number(process.env.BENCHMARK_MAX_MEASUREMENT_MS ?? 500);

if (!Number.isInteger(USER_COUNT) || USER_COUNT < 100) throw new Error('BENCHMARK_USERS must be an integer >= 100');
if (!Number.isInteger(ITERATIONS) || ITERATIONS < 1) throw new Error('BENCHMARK_ITERATIONS must be an integer >= 1');

const users = Array.from({ length: USER_COUNT }, (_, index) => ({
  customerId: `customer-${index}`,
  sessionId: `session-${index}`,
  requestedMbps: 5 + (index % 25),
  priority: 1 + (index % 3),
  weight: 1 + (index % 5),
}));

const engine = new FairnessEngine();
const policy = {
  capacityMbps: Math.max(100, USER_COUNT * 8),
  activateThresholdPercent: 80,
  aggressiveThresholdPercent: 90,
  recoveryThresholdPercent: 60,
};

function runFairness() {
  const started = performance.now();
  let decision;
  for (let i = 0; i < ITERATIONS; i += 1) decision = engine.decide(policyWithCongestion());
  return { elapsedMs: performance.now() - started, decision };
}

function policyWithCongestion() {
  return {
    ...policy,
    capacityMbps: USER_COUNT * 10,
    activeUsers: users,
  };
}

function runMeasurement() {
  const started = performance.now();
  let result;
  const previous = { bytesIn: 1_000_000_000, bytesOut: 500_000_000, sampledAt: new Date('2026-09-13T00:00:00.000Z') };
  for (let i = 0; i < USER_COUNT * ITERATIONS; i += 1) {
    result = calculateThroughput(previous, {
      bytesIn: previous.bytesIn + 1_250_000,
      bytesOut: previous.bytesOut + 250_000,
      sampledAt: new Date(previous.sampledAt.getTime() + 1000),
    });
  }
  return { elapsedMs: performance.now() - started, result };
}

function runCommandConversion() {
  const started = performance.now();
  const allocations = users.map((u) => ({ ...u, allocatedMbps: u.requestedMbps / 2 }));
  const commands = toEnforcementCommands('router-benchmark', allocations, 0.5);
  return { elapsedMs: performance.now() - started, commandCount: commands.length };
}

const fairness = runFairness();
const measurement = runMeasurement();
const commands = runCommandConversion();

const totalAllocated = fairness.decision.allocations.reduce((sum, allocation) => sum + allocation.allocatedMbps, 0);
if (!Number.isFinite(totalAllocated) || totalAllocated < 0) throw new Error('Fairness benchmark produced invalid allocation totals');
if (fairness.elapsedMs > MAX_FAIRNESS_MS) throw new Error(`Fairness benchmark exceeded ${MAX_FAIRNESS_MS}ms: ${fairness.elapsedMs.toFixed(2)}ms`);
if (measurement.elapsedMs > MAX_MEASUREMENT_MS) throw new Error(`Measurement benchmark exceeded ${MAX_MEASUREMENT_MS}ms: ${measurement.elapsedMs.toFixed(2)}ms`);
if (commands.commandCount !== USER_COUNT) throw new Error(`Expected ${USER_COUNT} commands, got ${commands.commandCount}`);

console.log(JSON.stringify({
  benchmark: 'JASLYN NET traffic core',
  users: USER_COUNT,
  iterations: ITERATIONS,
  fairness: {
    elapsedMs: Number(fairness.elapsedMs.toFixed(2)),
    averageMs: Number((fairness.elapsedMs / ITERATIONS).toFixed(4)),
    mode: fairness.decision.mode,
    allocationTotalMbps: Number(totalAllocated.toFixed(3)),
  },
  measurement: {
    operations: USER_COUNT * ITERATIONS,
    elapsedMs: Number(measurement.elapsedMs.toFixed(2)),
    averageMicroseconds: Number(((measurement.elapsedMs * 1000) / (USER_COUNT * ITERATIONS)).toFixed(3)),
    sample: measurement.result,
  },
  commandConversion: {
    elapsedMs: Number(commands.elapsedMs.toFixed(2)),
    commands: commands.commandCount,
  },
}));
