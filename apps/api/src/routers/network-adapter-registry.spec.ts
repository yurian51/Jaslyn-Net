import { describe, expect, it } from 'vitest';
import { NetworkAdapterRegistry } from './network-adapter-registry';

describe('NetworkAdapterRegistry', () => {
  it('reports only executable adapters as implemented', () => {
    const registry = new NetworkAdapterRegistry();
    expect(registry.isImplemented('MIKROTIK_REST')).toBe(true);
    expect(registry.isImplemented('OMADA_CONTROLLER_API')).toBe(false);
  });

  it('normalizes protocol lookup', () => {
    const registry = new NetworkAdapterRegistry();
    expect(registry.get('mikrotik_rest')?.lifecycle).toBe('IMPLEMENTED');
  });
});
