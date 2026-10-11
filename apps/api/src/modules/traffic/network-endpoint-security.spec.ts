import { isRestrictedNetworkAddress } from './network-endpoint-security';

describe('isRestrictedNetworkAddress', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.5',
    '203.0.113.10',
    '224.0.0.1',
    '::',
    '::1',
    'fc00::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ])('rejects restricted address %s', (address) => {
    expect(isRestrictedNetworkAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'allows public address %s',
    (address) => expect(isRestrictedNetworkAddress(address)).toBe(false),
  );
});
