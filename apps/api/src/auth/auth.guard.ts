import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { jwtVerify } from 'jose';
import type { Request } from 'express';

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

    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.tenantId !== 'string' || typeof payload.role !== 'string' || typeof payload.sid !== 'string') {
        throw new Error('Invalid claims');
      }
      const sessionId = payload.sid;
      const session = await this.db.query(
        `SELECT id FROM auth_sessions
         WHERE id=$1 AND tenant_id=$2 AND user_id=$3
           AND revoked_at IS NULL AND expires_at>now()`,
        [sessionId, payload.tenantId, payload.sub],
      );
      if (!session.rowCount) throw new UnauthorizedException('Session has been revoked or expired');
      request.user = {
        id: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        email: typeof payload.email === 'string' ? payload.email : '',
        sessionId,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
