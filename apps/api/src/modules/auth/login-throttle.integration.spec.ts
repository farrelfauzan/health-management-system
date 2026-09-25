import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoginThrottleService } from './service/login-throttle.service';

/**
 * The throttled login as the client receives it, over HTTP against Postgres.
 *
 * The refusal used to be built as `{ error: { code, message, details } }` and
 * handed to the global filter, which reads those keys one level up — so the
 * browser got `message: "Http Exception"` and no `retryAfterSeconds`, and the
 * login page could say neither why nor for how long. The unit specs prove the
 * body; this proves the wire.
 */
describe('Throttled login over HTTP against Postgres', () => {
  const TEST_EMAIL = 'login-throttle-envelope-spec@example.test';
  const MAX_ATTEMPTS_BEFORE_REFUSAL = 12;
  /** Up to a dozen Argon2-verified logins; the default 5 s is too tight on a loaded runner. */
  const THROTTLE_TEST_TIMEOUT_MS = 60_000;

  let app: INestApplication;
  let prisma: PrismaService;
  let identifierHash: string;

  async function removeAttempts(): Promise<void> {
    await prisma.loginAttempt.deleteMany({ where: { identifierHash } });
  }

  async function failLogin(): Promise<request.Response> {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: 'not-the-password-at-all' });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    identifierHash = moduleRef.get(LoginThrottleService).hashIdentifier(TEST_EMAIL);
    await removeAttempts();
  });

  afterAll(async () => {
    await removeAttempts();
    await app.close();
  });

  it('answers 429 with the documented envelope, its message and the wait', async () => {
    let actualResponse = await failLogin();
    for (let attempt = 1; attempt < MAX_ATTEMPTS_BEFORE_REFUSAL; attempt += 1) {
      if (actualResponse.status === 429) {
        break;
      }
      expect(actualResponse.status).toBe(401);
      actualResponse = await failLogin();
    }

    expect(actualResponse.status).toBe(429);
    expect(actualResponse.body).toEqual({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many login attempts. Try again later.',
        details: { retryAfterSeconds: expect.any(Number) },
      },
    });
    expect(actualResponse.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  }, THROTTLE_TEST_TIMEOUT_MS);
});
