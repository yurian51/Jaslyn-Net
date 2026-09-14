import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const environment = config.get<string>('NODE_ENV', 'development').trim().toLowerCase();
  const configuredOrigin = config.get<string>('CORS_ORIGIN', '*').trim();
  const allowAnyOrigin = configuredOrigin === '*';

  if (environment === 'production' && allowAnyOrigin) {
    throw new Error('CORS_ORIGIN must be explicitly configured in production');
  }

  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: allowAnyOrigin ? true : configuredOrigin.split(',').map((origin) => origin.trim()).filter(Boolean),
    credentials: !allowAnyOrigin,
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidUnknownValues: true,
    forbidNonWhitelisted: true,
  }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(config.get<number>('PORT', 4000), '0.0.0.0');
}

bootstrap();
