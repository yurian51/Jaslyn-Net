import { isIP } from 'node:net';

/**
 * Reject non-public destinations for outbound vendor-cloud API requests.
 * IPv6 is accepted only from global-unicast 2000::/3; IPv4-mapped IPv6 is
 * decoded first so it cannot be used to reach private IPv4 destinations.
 */
export function isRestrictedNetworkAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split('.').map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0 && octets[2] === 113) ||
      a >= 224;
  }
  if (version !== 6) return true;

  const normalized = address.toLowerCase();
  // Reject IPv4-mapped IPv6, including both dotted and hexadecimal forms.
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return isRestrictedNetworkAddress(mapped);
    const parts = mapped.split(':');
    if (parts.length === 2 && parts.every((part) => /^[0-9a-f]{1,4}$/.test(part))) {
      const high = Number.parseInt(parts[0], 16);
      const low = Number.parseInt(parts[1], 16);
      return isRestrictedNetworkAddress([high >> 8, high & 255, low >> 8, low & 255].join('.'));
    }
    return true;
  }
  const first = Number.parseInt(normalized.split(':')[0] || '0', 16);
  // Public IPv6 global-unicast allocation is within 2000::/3.
  return !Number.isFinite(first) || first < 0x2000 || first > 0x3fff;
}
