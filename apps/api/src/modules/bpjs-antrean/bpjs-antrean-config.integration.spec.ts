import { createCipheriv, createHash, createHmac } from 'node:crypto';

import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { compare } from 'bcryptjs';
import LZString from 'lz-string';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';

/**
 * P14-T03 configuration-surface integration tests. Auth and Prisma are mocked
 * (Prisma as one in-memory row), but the repository, credential crypto,
 * password hashing, HTTP client, signing, and response codec all run for
 * real: the fetch stub verifies the HMAC signature of the outgoing request,
 * asserts the Antrean header set, and encrypts its reply with the timestamp
 * the client actually sent — so a green test proves the full seal → store →
 * reveal → sign → decode chain.
 *
 * What it cannot prove is that BPJS agrees. The signature the stub verifies
 * and the codec it encrypts with are the P14 evaluation's hypotheses (spike
 * questions Q7 and Q8); this suite pins HMS's behaviour against its own
 * reading of the protocol, and the `P14-T02` fixtures replace it as evidence.
 */
describe('BPJS Antrean config integration', () => {
  const TEST_ENV: Record<string, string> = {
    BPJS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 0x44).toString('base64'),
    BPJS_ANTREAN_RETRY_BASE_DELAY_MS: '1',
    BPJS_ANTREAN_MAX_RETRY_ATTEMPTS: '0',
    SATUSEHAT_WORKER_ENABLED: 'false',
    BPJS_WORKER_ENABLED: 'false',
  };
  const previousEnv: Record<string, string | undefined> = {};

  const configRowId = '7c6b5a49-3821-4d0e-9f8a-1b2c3d4e5f60';
  const inputConsId = '20250042';
  const inputSecretKey = 'antrean-secret-key-value';
  const inputUserKey = 'antrean-user-key-value';
  const inputInboundPassword = 'antrean-inbound-password';
  const inputCreateBody = {
    environment: 'DEVELOPMENT',
    consId: inputConsId,
    kdProviderPpk: '01000101',
    secretKey: inputSecretKey,
    userKey: inputUserKey,
    inboundUsername: 'bpjs-antrean-ws',
    inboundPassword: inputInboundPassword,
    isActive: true,
  };

  let app: INestApplication;
  let jwtService: JwtService;
  let accessTokenSecret: string;
  let configRow: Record<string, unknown> | null = null;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const bpjsAntreanConfigDelegate = {
    findFirst: jest.fn(() => Promise.resolve(configRow === null ? null : { ...configRow })),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      configRow = {
        id: configRowId,
        credentialKeyVersion: 1,
        isActive: true,
        inboundUsername: null,
        inboundPasswordHash: null,
        lastTestedAt: null,
        lastTestResult: null,
        createdAt: new Date('2026-08-14T09:00:00.000Z'),
        updatedAt: new Date('2026-08-14T09:00:00.000Z'),
        ...data,
      };
      return Promise.resolve({ ...configRow });
    }),
    update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      configRow = { ...(configRow as Record<string, unknown>), ...data, updatedAt: new Date() };
      return Promise.resolve({ ...configRow });
    }),
    delete: jest.fn(() => {
      const deletedRow = configRow;
      configRow = null;
      return Promise.resolve(deletedRow);
    }),
  };
  const prismaServiceMock = {
    // IMP-8: `FeatureGuard` resolves this controller's entitlement through
    // Prisma on every request, and this stub replaces Prisma wholesale — so
    // the delegate has to exist here or every route in the suite answers 500.
    // No rows means no key is disabled, which is the fail-open default.
    featureEntitlement: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    bpjsAntreanConfig: bpjsAntreanConfigDelegate,
  };

  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: accessTokenSecret });
  }

  function mockActorWithPermissions(
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-user',
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: permissions.map((permission) => ({ permission })),
          },
        },
      ],
    });
  }

  function mockManagePermission(): void {
    mockActorWithPermissions([{ action: 'manage', resource: 'BpjsConfig', scope: 'ANY' }]);
  }

  function encryptAntreanResponse(timestamp: string, payload: unknown): string {
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
    const hash = createHash('sha256')
      .update(`${inputConsId}${inputSecretKey}${timestamp}`)
      .digest();
    const cipher = createCipheriv('aes-256-cbc', hash, hash.subarray(0, 16));
    return Buffer.concat([cipher.update(compressed, 'utf8'), cipher.final()]).toString('base64');
  }

  function stubRefPoliTransportVerifyingSignature(): void {
    fetchMock.mockImplementation((_url: string | URL, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      const timestamp = headers['X-Timestamp'] ?? '';
      const expectedSignature = createHmac('sha256', inputSecretKey)
        .update(`${inputConsId}&${timestamp}`)
        .digest('base64');
      if (headers['X-Signature'] !== expectedSignature || headers.user_key !== inputUserKey) {
        return Promise.resolve(new Response('bad signature', { status: 401 }));
      }
      const body = JSON.stringify({
        metaData: { code: '200', message: 'OK' },
        response: encryptAntreanResponse(timestamp, {
          list: [{ kodepoli: 'ANA', namapoli: 'ANAK' }],
        }),
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
  }

  beforeAll(async () => {
    for (const [key, value] of Object.entries(TEST_ENV)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }
    global.fetch = fetchMock as unknown as typeof fetch;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    jwtService = moduleRef.get(JwtService);
    accessTokenSecret =
      moduleRef.get(ConfigService).get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret';
  });

  afterAll(async () => {
    await app.close();
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    configRow = null;
    mockManagePermission();
  });

  it('refuses the config surface without the manage permission', async () => {
    mockActorWithPermissions([]);
    const token = await buildToken('actor-user', 'admin@example.com');

    await request(app.getHttpServer())
      .get('/api/v1/v1/bpjs/antrean/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 404 before any configuration is stored', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');

    await request(app.getHttpServer())
      .get('/api/v1/v1/bpjs/antrean/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('rejects a first save that omits an outbound secret', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    const bodyWithoutUserKey = { ...inputCreateBody, userKey: undefined };

    await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/antrean/config')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyWithoutUserKey)
      .expect(400);
  });

  it('accepts a first save without the inbound pair, which BPJS agrees at UAT', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');

    const createResponse = await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/antrean/config')
      .set('Authorization', `Bearer ${token}`)
      .send({
        environment: 'DEVELOPMENT',
        consId: inputConsId,
        kdProviderPpk: '01000101',
        secretKey: inputSecretKey,
        userKey: inputUserKey,
        isActive: true,
      })
      .expect(200);

    expect(createResponse.body.data.inboundUsername).toBeNull();
    expect(createResponse.body.data.hasInboundPassword).toBe(false);
  });

  it('creates, masks, updates without re-sending secrets, and never echoes a secret', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');

    const createResponse = await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/antrean/config')
      .set('Authorization', `Bearer ${token}`)
      .send(inputCreateBody)
      .expect(200);
    expect(createResponse.body.data).toMatchObject({
      environment: 'DEVELOPMENT',
      hasSecretKey: true,
      secretKeyLast4: inputSecretKey.slice(-4),
      hasUserKey: true,
      userKeyLast4: inputUserKey.slice(-4),
      inboundUsername: 'bpjs-antrean-ws',
      hasInboundPassword: true,
    });
    expect(JSON.stringify(createResponse.body)).not.toContain(inputSecretKey);
    expect(JSON.stringify(createResponse.body)).not.toContain(inputInboundPassword);

    const storedCiphertext = (configRow as Record<string, unknown>).secretKeyCiphertext;
    expect(String(storedCiphertext)).not.toContain(inputSecretKey);

    const updateResponse = await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/antrean/config')
      .set('Authorization', `Bearer ${token}`)
      .send({
        environment: 'PRODUCTION',
        consId: inputConsId,
        kdProviderPpk: '01000101',
        isActive: true,
      })
      .expect(200);
    expect(updateResponse.body.data.environment).toBe('PRODUCTION');
    expect(updateResponse.body.data.secretKeyLast4).toBe(inputSecretKey.slice(-4));
    expect(updateResponse.body.data.hasInboundPassword).toBe(true);
    expect((configRow as Record<string, unknown>).secretKeyCiphertext).toBe(storedCiphertext);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BPJS_ANTREAN_CONFIG_CREATED' }),
    );
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BPJS_ANTREAN_CONFIG_UPDATED' }),
    );
  });

  it('stores the inbound password as a verifiable hash, never as recoverable ciphertext', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');

    await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/antrean/config')
      .set('Authorization', `Bearer ${token}`)
      .send(inputCreateBody)
      .expect(200);

    const storedHash = String((configRow as Record<string, unknown>).inboundPasswordHash);
    expect(storedHash).not.toContain(inputInboundPassword);
    await expect(compare(inputInboundPassword, storedHash)).resolves.toBe(true);
    await expect(compare('wrong-password', storedHash)).resolves.toBe(false);
  });

  it('test-connection signs ref/poli with the stored credentials and decodes the encrypted reply', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/antrean/config')
      .set('Authorization', `Bearer ${token}`)
      .send(inputCreateBody)
      .expect(200);
    stubRefPoliTransportVerifyingSignature();

    const testResponse = await request(app.getHttpServer())
      .post('/api/v1/v1/bpjs/antrean/config/test-connection')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(testResponse.body.data.isSuccessful).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [actualUrl, actualInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(actualUrl)).toContain('/antreanfktp_dev/ref/poli');
    expect((actualInit.headers as Record<string, string>)['X-Authorization']).toBeUndefined();
    const readResponse = await request(app.getHttpServer())
      .get('/api/v1/v1/bpjs/antrean/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(readResponse.body.data.lastTestResult).toContain('OK');
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BPJS_ANTREAN_CONNECTION_TESTED',
        metadata: { isSuccessful: true },
      }),
    );
  });

  it('test-connection reports an unreachable upstream as a failed outcome', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/antrean/config')
      .set('Authorization', `Bearer ${token}`)
      .send(inputCreateBody)
      .expect(200);
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response('bad gateway', { status: 502 })),
    );

    const testResponse = await request(app.getHttpServer())
      .post('/api/v1/v1/bpjs/antrean/config/test-connection')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(testResponse.body.data.isSuccessful).toBe(false);
    expect(testResponse.body.data.message).toContain('BPJS_ANTREAN_UNAVAILABLE');
    expect((configRow as Record<string, unknown>).lastTestResult).toContain('FAILED');
  });

  it('deletes the configuration and audits it', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/antrean/config')
      .set('Authorization', `Bearer ${token}`)
      .send(inputCreateBody)
      .expect(200);

    await request(app.getHttpServer())
      .delete('/api/v1/v1/bpjs/antrean/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(configRow).toBeNull();
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BPJS_ANTREAN_CONFIG_DELETED' }),
    );
    await request(app.getHttpServer())
      .get('/api/v1/v1/bpjs/antrean/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
