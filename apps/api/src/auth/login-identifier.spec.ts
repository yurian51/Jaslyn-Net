import { normalizePhone, parseLoginIdentifier } from './login-identifier';

describe('normalizePhone', () => {
  it.each([
    ['+255712345678', '+255712345678'],
    ['255712345678', '+255712345678'],
    ['0712345678', '+255712345678'],
    ['712345678', '+255712345678'],
    ['00255712345678', '+255712345678'],
    ['0712 345 678', '+255712345678'],
    ['(0712) 345-678', '+255712345678'],
    ['+254 712 345 678', '+254712345678'],   // another country is kept as given
    ['  +255 689 123 456 ', '+255689123456'],
  ])('%s -> %s', (input, expected) => expect(normalizePhone(input)).toBe(expected));

  it.each(['', 'abc', '07123', '+255 12345', '0712345678901234', '+0123456789', '12-34', '0712 345 67a', '+2557123456789'])('rejects %j', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('gives every common way of writing one number the same result (so they share one throttle counter)', () => {
    const forms = ['+255712345678', '0712345678', '255712345678', '712 345 678', '0712-345-678'];
    expect(new Set(forms.map((f) => normalizePhone(f))).size).toBe(1);
  });
});

describe('parseLoginIdentifier', () => {
  it('treats anything with @ as an email and lowercases it', () => expect(parseLoginIdentifier(' Owner@Example.COM ')).toEqual({ kind: 'email', value: 'owner@example.com' }));
  it('treats digits as a phone', () => expect(parseLoginIdentifier('0712345678')).toEqual({ kind: 'phone', value: '+255712345678' }));
  it('rejects malformed emails and unusable input', () => {
    for (const bad of ['', '   ', 'a@b', '@b.co', 'no spaces@x.co', 'hello', '12']) expect(parseLoginIdentifier(bad)).toBeNull();
  });
  it('never lets an email-looking value be read as a phone', () => expect(parseLoginIdentifier('0712345678@x.co')?.kind).toBe('email'));
});
