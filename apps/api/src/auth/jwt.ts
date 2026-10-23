import { createHmac, timingSafeEqual } from 'node:crypto';

export const JWT_ISSUER = 'jaslyn-net';
export const JWT_AUDIENCE = 'jaslyn-net-api';

type JwtClaims = Record<string, unknown> & {
  sub: string;
  sid: string;
  tenantId: string;
  role: string;
  email?: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
};

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signature(input: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(input).digest();
}

export function signAccessToken(claims: {
  sub: string; sid: string; tenantId: string; role: string; email: string;
}, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    ...claims,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    jti: claims.sid,
    iat: nowSeconds,
    exp: nowSeconds + 900,
  });
  const input = header + '.' + payload;
  return input + '.' + signature(input, secret).toString('base64url');
}

export function verifyAccessToken(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): JwtClaims {
  if (typeof token !== 'string' || token.length > 16_384) throw new Error('Malformed JWT');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('Malformed JWT');

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Record<string, unknown>;
  if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('Unsupported JWT algorithm');

  const expected = signature(parts[0] + '.' + parts[1], secret);
  const supplied = Buffer.from(parts[2], 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error('Invalid JWT signature');
  }

  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Partial<JwtClaims>;
  if (payload.iss !== JWT_ISSUER || payload.aud !== JWT_AUDIENCE) throw new Error('Invalid JWT issuer or audience');
  if (!Number.isSafeInteger(payload.exp) || (payload.exp as number) <= nowSeconds) throw new Error('Expired JWT');
  if (!Number.isSafeInteger(payload.iat) || (payload.iat as number) > nowSeconds + 60) throw new Error('Invalid JWT issued-at time');
  if (typeof payload.sub !== 'string' || !payload.sub
    || typeof payload.sid !== 'string' || !payload.sid
    || typeof payload.tenantId !== 'string' || !payload.tenantId
    || typeof payload.role !== 'string' || !payload.role
    || payload.jti !== payload.sid) {
    throw new Error('Missing or invalid JWT session claims');
  }
  return payload as JwtClaims;
}
