const { performance } = require('node:perf_hooks');
const { FairnessEngine } = require('../dist/modules/traffic/fairness.engine');
const { calculateThroughput } = require('../dist/modules/traffic/traffic.measurement');
const { toEnforcementCommands } = require('../dist/modules/traffic/enforcement.adapter');

const USER_COUNT = Number(process.env.BENCHMARK_USERS ?? 10_000);
const ITERATIONS = Number(process.env.BENCHMARK_ITERATIONS ?? 50);
const MAX_FAIRNESS_MS = Number(process.env.BENCHMARK_MAX_FAIRNESS_MS ?? 2_000);
const MAX_MEASUREMENT_MS = Number(process.env.BENCHMARK_MAX_MEASUREMENT_MS ?? 500);
const MAX_COMMAND_MS = Number(process.env.BENCHMARK_MAX_COMMAND_MS ?? 250);
const EPSILON = 1e-6;

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

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function jain(values) {
  const total = sum(values);
  const squares = sum(values.map((value) => value * value));
  return squares > 0 ? (total * total) / (values.length * squares) : 1;
}

function weightedFairnessError(allocations) {
  const uncapped = allocations.filter((allocation) => allocation.requestedMbps > 0);
  if (uncapped.length < 2) return 0;
  const normalized = uncapped.map((allocation) => allocation.allocatedMbps / Math.max(0.1, allocation.weight * allocation.priority));
  const mean = sum(normalized) / normalized.length;
  return mean > 0 ? Math.max(...normalized.map((value) => Math.abs(value - mean) / mean)) : 0;
}

function assertResearchInvariants(decision, capacity, expectedMode) {
  const allocations = decision.allocations;
  const allocated = allocations.map((allocation) => allocation.allocatedMbps);
  const requested = allocations.map((allocation) => allocation.requestedMbps);
  const totalRequested = sum(requested);
  const totalAllocated = sum(allocated);

  if (decision.mode !== expectedMode) throw new Error(`Expected ${expectedMode}, got ${decision.mode}`);
  if (totalAllocated > Math.min(capacity, totalRequested) + EPSILON) throw new Error('Allocation exceeds capacity or demand');
  if (allocations.some((allocation) => !Number.isFinite(allocation.allocatedMbps) || allocation.allocatedMbps < -EPSILON)) throw new Error('Invalid allocation value');
  if (allocations.some((allocation) => allocation.allocatedMbps > allocation.requestedMbps + EPSILON)) throw new Error('Allocation exceeds user demand');
  if (totalRequested <= capacity + EPSILON && Math.abs(totalAllocated - totalRequested) > EPSILON) throw new Error('Work-conserving invariant violated');

  return {
    totalRequested,
    totalAllocated,
    jainFairness: jain(allocated.filter((value) => value > EPSILON)),
    weightedFairnessError: weightedFairnessError(allocations),
  };
}

function runFairness() {
  const started = performance.now();
  let decision;
  for (let i = 0; i < ITERATIONS; i += 1) {
    decision = engine.decide({ ...policy, capacityMbps: USER_COUNT * 10, activeUsers: users });
  }
  return { elapsedMs: performance.now() - started, decision };
}

function runEqualWeightResearchCase() {
  const activeUsers = Array.from({ length: 100 }, (_, index) => ({
    customerId: `equal-${index}`,
    requestedMbps: 100,
    weight: 1,
    priority: 1,
  }));
  const decision = engine.decide({
    capacityMbps: 1_000,
    activateThresholdPercent: 80,
    aggressiveThresholdPercent: 90,
    activeUsers,
  });
  const metrics = assertResearchInvariants(decision, 1_000, 'AGGRESSIVE');
  if (metrics.jainFairness < 0.999) throw new Error(`Equal-weight Jain fairness too low: ${metrics.jainFairness}`);
  return metrics;
}

function runWeightedTierResearchCase() {
  const activeUsers = [
    { customerId: 'basic', requestedMbps: 100, weight: 1, priority: 1 },
    { customerId: 'premium', requestedMbps: 100, weight: 2, priority: 1 },
  ];
  const decision = engine.decide({
    capacityMbps: 60,
    activateThresholdPercent: 80,
    aggressiveThresholdPercent: 90,
    activeUsers,
  });
  const metrics = assertResearchInvariants(decision, 60, 'AGGRESSIVE');
  const ratio = decision.allocations[1].allocatedMbps / decision.allocations[0].allocatedMbps;
  if (Math.abs(ratio - 2) > 0.0001) throw new Error(`Weighted max-min ratio drifted: ${ratio}`);
  return { ...metrics, premiumToBasicRatio: ratio };
}

function runWorkConservingCase() {
  const activeUsers = [
    { customerId: 'small', requestedMbps: 10, weight: 1, priority: 1 },
    { customerId: 'large', requestedMbps: 100, weight: 1, priority: 1 },
  ];
  const decision = engine.decide({
    capacityMbps: 100,
    activeUsers,
  });
  const metrics = assertResearchInvariants(decision, 100, 'AGGRESSIVE');
  if (Math.abs(metrics.totalAllocated - 100) > EPSILON) throw new Error('Unused demand was not redistributed');
  return metrics;
}

function runMeasurement() {
  const started = performance.now();
  let result;
  const previous = { bytesIn: '9007199254740990000', bytesOut: '5000000000000000000', sampledAt: new Date('2026-09-13T00:00:00.000Z') };
  for (let i = 0; i < USER_COUNT * ITERATIONS; i += 1) {
    result = calculateThroughput(previous, {
      bytesIn: '9007199254740991250',
      bytesOut: '5000000000000000250',
      sampledAt: new Date('2026-09-13T00:00:01.000Z'),
    });
  }
  if (result.totalMbps !== 12_000) throw new Error(`Unexpected 64-bit counter throughput: ${result.totalMbps}`);
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
const equalWeight = runEqualWeightResearchCase();
const weightedTier = runWeightedTierResearchCase();
const workConserving = runWorkConservingCase();
const totalAllocated = sum(fairness.decision.allocations.map((allocation) => allocation.allocatedMbps));

if (!Number.isFinite(totalAllocated) || totalAllocated < 0) throw new Error('Fairness benchmark produced invalid allocation totals');
if (fairness.elapsedMs > MAX_FAIRNESS_MS) throw new Error(`Fairness benchmark exceeded ${MAX_FAIRNESS_MS}ms: ${fairness.elapsedMs.toFixed(2)}ms`);
if (measurement.elapsedMs > MAX_MEASUREMENT_MS) throw new Error(`Measurement benchmark exceeded ${MAX_MEASUREMENT_MS}ms: ${measurement.elapsedMs.toFixed(2)}ms`);
if (commands.elapsedMs > MAX_COMMAND_MS) throw new Error(`Command conversion benchmark exceeded ${MAX_COMMAND_MS}ms: ${commands.elapsedMs.toFixed(2)}ms`);
if (commands.commandCount !== USER_COUNT) throw new Error(`Expected ${USER_COUNT} commands, got ${commands.commandCount}`);

console.log(JSON.stringify({
  benchmark: 'JASLYN NET traffic core + sensible-network fairness research invariants',
  users: USER_COUNT,
  iterations: ITERATIONS,
  fairness: {
    elapsedMs: Number(fairness.elapsedMs.toFixed(2)),
    averageMs: Number((fairness.elapsedMs / ITERATIONS).toFixed(4)),
    mode: fairness.decision.mode,
    allocationTotalMbps: Number(totalAllocated.toFixed(3)),
  },
  research: {
    equalWeightJain: Number(equalWeight.jainFairness.toFixed(6)),
    weightedTierRatio: Number(weightedTier.premiumToBasicRatio.toFixed(6)),
    weightedFairnessError: Number(weightedTier.weightedFairnessError.toFixed(6)),
    workConservingAllocatedMbps: Number(workConserving.totalAllocated.toFixed(3)),
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
