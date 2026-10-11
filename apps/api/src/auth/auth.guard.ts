import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';
import type { Request } from 'express';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export type AuthenticatedRequest = Request & {
  headers: { authorization?: string; 'user-agent'?: string | string[] };
  requestId?: string;
  ip?: string;
  user?: {
    id: string;
    tenantId: string;
    role: string;
    email: string;
    sessionId: string;
  };
};

const ISSUER = 'jaslyn-net';
const AUDIENCE = 'jaslyn-net-api';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService, @Inject(PG_POOL) private readonly db: Pool) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Authentication required');

    const token = authorization.slice(7).trim();
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret || secret.length < 32) throw new UnauthorizedException('Authentication is not configured');

    let payload;
    try {
      const verified = await jwtVerify(token, new TextEncoder().encode(secret), {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      payload = verified.payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (typeof payload.sub !== 'string' || typeof payload.tenantId !== 'string'
      || typeof payload.role !== 'string' || typeof payload.sid !== 'string') {
      throw new UnauthorizedException('Access token is missing required session claims');
    }

    // This database check makes revocation effective immediately rather than
    // waiting for the short-lived JWT to expire. Database outages remain server
    // errors and are not disguised as invalid credentials.
    const session = await this.db.query(
      `SELECT id FROM auth_sessions
       WHERE id=$1 AND tenant_id=$2 AND user_id=$3
         AND revoked_at IS NULL AND expires_at>now()`,
      [payload.sid, payload.tenantId, payload.sub],
    );
    if (!session.rowCount) throw new UnauthorizedException('Session has been revoked or expired');
    await this.db.query(
      "UPDATE auth_sessions SET last_seen_at=now() WHERE id=$1 AND last_seen_at < now()-interval '5 minutes'",
      [payload.sid],
    );

    request.user = {
      id: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      email: typeof payload.email === 'string' ? payload.email : '',
      sessionId: payload.sid,
    };
    return true;
  }
}
