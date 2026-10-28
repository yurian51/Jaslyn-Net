import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RequestObservabilityInterceptor } from './common/request-observability.interceptor';
import { StructuredLogger } from './common/structured-logger';
import { CommunicationWebSocket } from './communication/communication.websocket';

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.removeHeader('X-Powered-By');
  next();
}

export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: new StructuredLogger(),
  });
  const config = app.get(ConfigService);
  const environment = config.get<string>('NODE_ENV', 'development').trim().toLowerCase();
  const isProduction = environment === 'production';
  const configuredOrigin = config.get<string>('CORS_ORIGIN', '*').trim();
  const allowAnyOrigin = configuredOrigin === '*';

  // Fail fast: validate secrets BEFORE the server starts accepting traffic.
  const jwtSecret = config.get<string>('JWT_SECRET', config.get<string>('SUPABASE_JWT_SECRET', '')).trim();
  if (!jwtSecret) {
    if (isProduction) throw new Error('JWT_SECRET or SUPABASE_JWT_SECRET must be configured in production');
    console.warn('JWT_SECRET is empty; WebSocket auth is not safe outside local development');
  } else if (jwtSecret.length < 32) {
    console.warn('JWT_SECRET is shorter than 32 characters; use a long random value');
  }

  const rawPort = config.get<string | number>('PORT', 4000);
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${String(rawPort)}`);
  }

  // Behind a reverse proxy (Render) request.ip is the proxy unless told how many hops to trust. Default 0 = trust
  // none (prevents X-Forwarded-For spoofing); set TRUST_PROXY_HOPS=1 when exactly one proxy fronts the API.
  const proxyHops = Number(config.get<string>('TRUST_PROXY_HOPS', '0'));
  if (Number.isInteger(proxyHops) && proxyHops > 0) app.getHttpAdapter().getInstance().set('trust proxy', proxyHops);

  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: '', method: RequestMethod.GET },
      { path: '/', method: RequestMethod.GET },
    ],
  });
  app.enableCors({
    origin: allowAnyOrigin ? true : configuredOrigin.split(',').map((origin) => origin.trim()).filter(Boolean),
    credentials: !allowAnyOrigin,
    exposedHeaders: ['x-request-id', 'x-correlation-id'],
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidUnknownValues: true,
    forbidNonWhitelisted: true,
  }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestObservabilityInterceptor());
  app.get(CommunicationWebSocket).attach(app.getHttpServer(), jwtSecret);
  await app.init();
  return { app, port };
}

if (!process.env.VERCEL) {
  createApp()
    .then(({ app, port }) => app.listen(port, '0.0.0.0'))
    .catch((error: unknown) => {
      console.error('Fatal error during API bootstrap', error);
      process.exit(1);
    });
}
