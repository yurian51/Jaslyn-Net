import { evaluateWanHealth } from './wan-health-state';

describe('evaluateWanHealth', () => {
  it('does not flap a healthy member on a transient failure', () => {
    const result = evaluateWanHealth({ current: 'HEALTHY', success: false, consecutiveFailures: 1, consecutiveSuccesses: 0, failureThreshold: 3, recoveryThreshold: 3 });
    expect(result.state).toBe('HEALTHY');
    expect(result.changed).toBe(false);
  });

  it('marks a member unavailable at the configured failure threshold', () => {
    const result = evaluateWanHealth({ current: 'DEGRADED', success: false, consecutiveFailures: 3, consecutiveSuccesses: 0, failureThreshold: 3, recoveryThreshold: 3 });
    expect(result.state).toBe('UNAVAILABLE');
    expect(result.changed).toBe(true);
  });

  it('enters recovering before returning healthy', () => {
    const recovering = evaluateWanHealth({ current: 'UNAVAILABLE', success: true, consecutiveFailures: 0, consecutiveSuccesses: 1, failureThreshold: 3, recoveryThreshold: 3 });
    expect(recovering.state).toBe('RECOVERING');
    const healthy = evaluateWanHealth({ current: 'RECOVERING', success: true, consecutiveFailures: 0, consecutiveSuccesses: 3, failureThreshold: 3, recoveryThreshold: 3 });
    expect(healthy.state).toBe('HEALTHY');
  });

  it('marks high utilization degraded without declaring the link unavailable', () => {
    const result = evaluateWanHealth({ current: 'HEALTHY', success: true, consecutiveFailures: 0, consecutiveSuccesses: 5, failureThreshold: 3, recoveryThreshold: 3, utilizationPercent: 90, degradeThresholdPercent: 80 });
    expect(result.state).toBe('DEGRADED');
  });

  it('preserves administrative disabled and draining states', () => {
    expect(evaluateWanHealth({ current: 'DISABLED', success: true, consecutiveFailures: 0, consecutiveSuccesses: 10, failureThreshold: 3, recoveryThreshold: 3 }).state).toBe('DISABLED');
    expect(evaluateWanHealth({ current: 'DRAINING', success: true, consecutiveFailures: 0, consecutiveSuccesses: 10, failureThreshold: 3, recoveryThreshold: 3 }).state).toBe('DRAINING');
  });
});
