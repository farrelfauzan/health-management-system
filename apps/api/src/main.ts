import { NestFactory } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { stringify } from 'yaml';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HMS API')
    .setDescription('Health Management System API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  const httpAdapter = app.getHttpAdapter();
  const openApiYaml = stringify(swaggerDocument);

  httpAdapter.get('/api/openapi.yaml', (_request: unknown, response: { type: (v: string) => unknown; send: (v: string) => unknown }) => {
    response.type('application/yaml');
    response.send(openApiYaml);
  });

  const configService = app.get(ConfigService);

  const port = Number(configService.get<number>('PORT') ?? 3001);
  await app.listen(port);

  Logger.log(`🚀 Application is running on: http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
