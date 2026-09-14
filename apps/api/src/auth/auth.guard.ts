import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';

export type AuthenticatedRequest = {
  headers: { authorization?: string };
  requestId?: string;
  user?: {
    id: string;
    tenantId: string;
    role: string;
    email: string;
  };
};

const ISSUER = 'jaslyn-net';
const AUDIENCE = 'jaslyn-net-api';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

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
      if (typeof payload.sub !== 'string' || typeof payload.tenantId !== 'string' || typeof payload.role !== 'string') {
        throw new Error('Invalid claims');
      }
      request.user = {
        id: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        email: typeof payload.email === 'string' ? payload.email : '',
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
