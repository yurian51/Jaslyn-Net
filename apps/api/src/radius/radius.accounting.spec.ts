import * as radiusProtocol from './radius.protocol';

describe('RADIUS 64-bit accounting counters', () => {
  const readCounter = (radiusProtocol as unknown as Record<string, unknown>).uint64CounterAttribute as
    | ((packet: radiusProtocol.RadiusPacket, lowType: number, highType: number) => bigint | undefined)
    | undefined;

  it('combines Acct-Gigawords with the low 32-bit octet counter', () => {
    const packet: radiusProtocol.RadiusPacket = {
      code: radiusProtocol.RADIUS_CODES.ACCOUNTING_REQUEST,
      identifier: 1,
      authenticator: Buffer.alloc(16),
      attributes: [
        { type: 42, value: Buffer.from([0, 0, 0, 123]) },
        { type: 52, value: Buffer.from([0, 0, 0, 5]) },
      ],
    };

    expect(typeof readCounter).toBe('function');
    expect(readCounter?.(packet, 42, 52)).toBe((5n << 32n) + 123n);
  });

  it('preserves legacy NAS counters when Gigawords is absent', () => {
    const packet: radiusProtocol.RadiusPacket = {
      code: radiusProtocol.RADIUS_CODES.ACCOUNTING_REQUEST,
      identifier: 2,
      authenticator: Buffer.alloc(16),
      attributes: [{ type: 43, value: Buffer.from([0, 0, 1, 44]) }],
    };

    expect(readCounter?.(packet, 43, 53)).toBe(300n);
  });

  it('does not silently truncate malformed counter attributes', () => {
    const packet: radiusProtocol.RadiusPacket = {
      code: radiusProtocol.RADIUS_CODES.ACCOUNTING_REQUEST,
      identifier: 3,
      authenticator: Buffer.alloc(16),
      attributes: [
        { type: 42, value: Buffer.from([0, 0, 0, 10]) },
        { type: 52, value: Buffer.from([0, 1]) },
      ],
    };

    expect(readCounter?.(packet, 42, 52)).toBeUndefined();
  });
});
