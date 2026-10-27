import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RequestObservabilityInterceptor } from './common/request-observability.interceptor';
import { StructuredLogger } from './common/structured-logger';
import { CommunicationWebSocket } from './communication/communication.websocket';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: new StructuredLogger(),
  });
  const config = app.get(ConfigService);
  const environment = config.get<string>('NODE_ENV', 'development').trim().toLowerCase();
  const configuredOrigin = config.get<string>('CORS_ORIGIN', '*').trim();
  const allowAnyOrigin = configuredOrigin === '*';

  if (environment === 'production' && allowAnyOrigin) {
    throw new Error('CORS_ORIGIN must be explicitly configured in production');
  }

  // Behind a reverse proxy (Render) request.ip is the proxy unless told how many hops to trust. Default 0 = trust
  // none (prevents X-Forwarded-For spoofing); set TRUST_PROXY_HOPS=1 when exactly one proxy fronts the API.
  const proxyHops = Number(config.get<string>('TRUST_PROXY_HOPS', '0'));
  if (Number.isInteger(proxyHops) && proxyHops > 0) app.getHttpAdapter().getInstance().set('trust proxy', proxyHops);

  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: '/', method: RequestMethod.GET }],
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
  await app.listen(config.get<number>('PORT', 4000), '0.0.0.0');
  const jwtSecret = config.get<string>('JWT_SECRET', '');
  app.get(CommunicationWebSocket).attach(app.getHttpServer(), jwtSecret);
}

bootstrap();
