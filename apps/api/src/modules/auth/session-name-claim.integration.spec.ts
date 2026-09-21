import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PasswordHasherService } from '../../common/crypto/password-hasher.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * P20-T08 against real Postgres, signing in for real.
 *
 * The shell greets people from the `name` the API writes into the access token
 * and the session hint, so the claims worth a database are the end-to-end
 * ones: a named pharmacist carries their account name in both, an account
 * nothing names carries no name at all (the web shows the plain address), and
 * a rename reaches both at the next refresh — read off the real token and the
 * real `Set-Cookie` headers.
 */
describe('Session name claim against Postgres (P20-T08)', () => {
  const TEST_MARKER = 'p20t08-session-name-spec';
  const PASSWORD = 'kunci-langit-biru-2026';
  const NAMED_USER_ID = '9eeeee40-eeee-4eee-8eee-eeeeeeeeee81';
  const UNNAMED_USER_ID = '9eeeee40-eeee-4eee-8eee-eeeeeeeeee82';
  const USER_IDS = [NAMED_USER_ID, UNNAMED_USER_ID] as const;
  const ROLE_CODE = 'P20T08_SPEC_PHARMACIST';
  const HINT_COOKIE = 'hms_session_hint';
  const REFRESH_COOKIE = 'hms_refresh_token';

  let app: INestApplication;
  let prisma: PrismaService;
  let namedRefreshToken: string;

  function emailFor(userId: string): string {
    return `${TEST_MARKER}-${userId.slice(-2)}@example.test`;
  }

  function readCookie(response: request.Response, name: string): string | undefined {
    const setCookies = (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    const entry = setCookies.find((cookie) => cookie.startsWith(`${name}=`));
    return entry ? decodeURIComponent(entry.split(';')[0]!.slice(name.length + 1)) : undefined;
  }

  function decodeBase64UrlJson(value: string): Record<string, unknown> {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
  }

  function readClaims(response: request.Response): {
    hint: Record<string, unknown>;
    token: Record<string, unknown>;
  } {
    // Login nests the pair under `tokens`; refresh answers with the pair itself.
    const data = response.body.data as { tokens?: { accessToken: string }; accessToken?: string };
    const accessToken = data.tokens?.accessToken ?? data.accessToken ?? '';
    return {
      hint: decodeBase64UrlJson(readCookie(response, HINT_COOKIE) ?? ''),
      token: decodeBase64UrlJson(accessToken.split('.')[1] ?? ''),
    };
  }

  async function signIn(userId: string): Promise<request.Response> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailFor(userId), password: PASSWORD });
    expect(response.body.data?.status).toBe('AUTHENTICATED');
    return response;
  }

  async function seedFixtures(passwordHash: string): Promise<void> {
    const role = await prisma.role.upsert({
      where: { code: ROLE_CODE },
      update: { deletedAt: null },
      create: { code: ROLE_CODE, name: `${TEST_MARKER} pharmacist`, isSystem: false },
    });
    await prisma.user.create({
      data: {
        id: NAMED_USER_ID,
        email: emailFor(NAMED_USER_ID),
        fullName: 'Rina Apoteker',
        passwordHash,
        isActive: true,
      },
    });
    await prisma.user.create({
      data: { id: UNNAMED_USER_ID, email: emailFor(UNNAMED_USER_ID), passwordHash, isActive: true },
    });
    await prisma.userRole.createMany({
      data: USER_IDS.map((userId) => ({ userId, roleId: role.id })),
    });
  }

  async function removeFixtures(): Promise<void> {
    await prisma.userRole.deleteMany({ where: { userId: { in: [...USER_IDS] } } });
    await prisma.role.deleteMany({ where: { code: ROLE_CODE } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [...USER_IDS] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...USER_IDS] } } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const passwordHash = await moduleRef.get(PasswordHasherService).hashPassword(PASSWORD);
    await removeFixtures();
    await seedFixtures(passwordHash);
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  it('carries a named pharmacist’s account name in the token and the hint', async () => {
    const response = await signIn(NAMED_USER_ID);

    const actualClaims = readClaims(response);
    expect(actualClaims.token.name).toBe('Rina Apoteker');
    expect(actualClaims.hint.name).toBe('Rina Apoteker');
    namedRefreshToken = readCookie(response, REFRESH_COOKIE) ?? '';
  });

  it('carries no name at all for an account nothing names', async () => {
    const response = await signIn(UNNAMED_USER_ID);

    const actualClaims = readClaims(response);
    expect(actualClaims.token).not.toHaveProperty('name');
    expect(actualClaims.hint).not.toHaveProperty('name');
    expect(actualClaims.token.email).toBe(emailFor(UNNAMED_USER_ID));
  });

  it('carries a renamed account’s new name at the next refresh', async () => {
    await prisma.user.update({
      where: { id: NAMED_USER_ID },
      data: { fullName: 'Rina Kusuma' },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${namedRefreshToken}`);

    expect(response.status).toBe(200);
    const actualClaims = readClaims(response);
    expect(actualClaims.token.name).toBe('Rina Kusuma');
    expect(actualClaims.hint.name).toBe('Rina Kusuma');
  });
});
