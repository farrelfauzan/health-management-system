import { NestFactory } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    },
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  app.enableVersioning({
    defaultVersion: '1',
    prefix: 'v',
    type: 0,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ZodValidationPipe());

  const configService = app.get(ConfigService);

  const port = Number(configService.get<number>('PORT') ?? 3001);
  await app.listen(port);

  Logger.log(`🚀 Application is running on: http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
