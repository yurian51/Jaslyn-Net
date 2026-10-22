import { ValidationPipe } from '@nestjs/common';
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

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: new StructuredLogger(),
  });
  const config = app.get(ConfigService);
  const environment = config.get<string>('NODE_ENV', 'development').trim().toLowerCase();
  const isProduction = environment === 'production';
  const configuredOrigin = config.get<string>('CORS_ORIGIN', '*').trim();
  const allowAnyOrigin = configuredOrigin === '*';

  if (isProduction && allowAnyOrigin) {
    throw new Error('CORS_ORIGIN must be explicitly configured in production');
  }

  // Fail fast: validate secrets BEFORE the server starts accepting traffic.
  const jwtSecret = config.get<string>('JWT_SECRET', '').trim();
  if (!jwtSecret) {
    if (isProduction) throw new Error('JWT_SECRET must be configured in production');
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
  app.use(securityHeaders);
  app.setGlobalPrefix('api/v1');
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
  await app.listen(port, '0.0.0.0');
  app.get(CommunicationWebSocket).attach(app.getHttpServer(), jwtSecret);
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal error during API bootstrap', error);
  process.exit(1);
});
