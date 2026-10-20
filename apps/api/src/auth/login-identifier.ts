export type LoginIdentifier = { kind: 'email' | 'phone'; value: string };

/**
 * Normalises a mobile number to E.164. Accepts +255712345678, 255712345678, 0712345678, 712345678, 00255712345678
 * with spaces/dashes/brackets. Local formats assume Tanzania (+255) unless a country code is given.
 * Returns null when the input cannot be a valid number.
 */
export function normalizePhone(input: string, defaultCountryCode = '255'): string | null {
  const s = input.trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d+$/.test(s)) return null;
  let digits: string;
  if (s.startsWith('+')) digits = s.slice(1);
  else if (s.startsWith('00')) digits = s.slice(2);
  else if (s.startsWith('0')) digits = defaultCountryCode + s.slice(1);
  else if (s.startsWith(defaultCountryCode) && s.length >= defaultCountryCode.length + 9) digits = s;
  else digits = defaultCountryCode + s;
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  if (digits.startsWith('255') && digits.length !== 12) return null; // Tanzanian numbers: 255 + 9 digits
  return `+${digits}`;
}

/** An identifier containing "@" is an email; anything else must be a valid phone number. */
export function parseLoginIdentifier(raw: string): LoginIdentifier | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? { kind: 'email', value: trimmed.toLowerCase() } : null;
  const phone = normalizePhone(trimmed);
  return phone ? { kind: 'phone', value: phone } : null;
}
