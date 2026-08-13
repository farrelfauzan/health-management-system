import { NestFactory } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import { resolveCorsOptions } from './common/config/resolve-cors-options';
import { validateEnvironment } from './common/config/validate-environment';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { stringify } from 'yaml';

async function bootstrap(): Promise<void> {
  // SJ-5: refuse to start when a required secret is missing, before a single
  // provider is constructed. Deliberately here rather than as ConfigModule's
  // `validate` hook: whatever that hook returns becomes `validatedEnvConfig`,
  // which `ConfigService.get` consults *ahead of* `process.env` — so wiring it
  // there silently freezes configuration at import time and shadows every
  // later change to the environment. Importing AppModule above has already run
  // ConfigModule.forRoot, so `.env` is loaded into process.env by this point.
  validateEnvironment(process.env);

  const app = await NestFactory.create(AppModule, {
    // Keeps the undecoded request body on `request.rawBody` (`PCS-T09`).
    // GOWA signs the exact bytes it sent, and a signature verified against
    // `JSON.stringify(parsedBody)` would be verifying a re-serialisation —
    // key order, whitespace, and unicode escaping are all free to differ, so
    // the check would fail on valid deliveries and, worse, could be made to
    // pass on crafted ones. The raw buffer is the only thing worth signing.
    rawBody: true,
    // SJ-1: an allowlist from the environment, never `origin: true`. Read the
    // resolver for why reflecting the caller's Origin alongside
    // `credentials: true` is an open door, and why production refuses to fall
    // back to a default.
    cors: resolveCorsOptions(process.env),
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  app.enableVersioning({
    defaultVersion: '1',
    prefix: 'v',
    type: 0,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ZodValidationPipe());

  // How many proxy hops in front of the API may be trusted to have appended
  // X-Forwarded-For, which is what decides `request.ip` and therefore the
  // address written on every audit row (SJ-4). Zero — the default — ignores
  // the header outright and uses the socket peer, because a header the caller
  // controls must not be recorded as fact. Raise it to the real hop count once
  // SJ-1 puts a TLS terminator in front, and no further: trusting one hop too
  // many hands the client the first entry back.
  const trustedProxyHops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', Number.isFinite(trustedProxyHops) ? trustedProxyHops : 0);

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

  httpAdapter.get(
    '/api/openapi.yaml',
    (
      _request: unknown,
      response: { type: (v: string) => unknown; send: (v: string) => unknown },
    ) => {
      response.type('application/yaml');
      response.send(openApiYaml);
    },
  );

  const configService = app.get(ConfigService);

  const port = Number(configService.get<number>('PORT') ?? 3001);
  await app.listen(port);

  Logger.log(`🚀 Application is running on: http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
