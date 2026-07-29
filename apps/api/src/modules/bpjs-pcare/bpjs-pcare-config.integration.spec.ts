import { createCipheriv, createHash, createHmac } from 'node:crypto';

import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import LZString from 'lz-string';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';

/**
 * P11-T02 configuration-surface integration tests. Auth and Prisma are
 * mocked (Prisma as one in-memory row), but the repository, credential
 * crypto, HTTP client, signing, and response codec all run for real: the
 * fetch stub verifies the HMAC signature of the outgoing request and
 * encrypts its reply with the timestamp the client actually sent — so a
 * green test proves the full seal → store → reveal → sign → decode chain.
 */
describe('BPJS PCare config integration', () => {
  const TEST_ENV: Record<string, string> = {
    BPJS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 0x44).toString('base64'),
    BPJS_PCARE_RETRY_BASE_DELAY_MS: '1',
    BPJS_PCARE_MAX_RETRY_ATTEMPTS: '0',
    SATUSEHAT_WORKER_ENABLED: 'false',
  };
  const previousEnv: Record<string, string | undefined> = {};

  const configRowId = '3f2a1b0c-9d8e-4f7a-b6c5-d4e3f2a1b0c9';
  const inputConsId = '20250001';
  const inputSecretKey = 'spike-secret-key-value';
  const inputUserKey = 'spike-user-key-value';
  const inputPcarePassword = 'spike-password-value';
  const inputCreateBody = {
    environment: 'DEVELOPMENT',
    consId: inputConsId,
    kdProviderPpk: '01000101',
    pcareUsername: 'klinik-demo',
    secretKey: inputSecretKey,
    userKey: inputUserKey,
    pcarePassword: inputPcarePassword,
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
  const auditServiceMock = { record: jest.fn() };
  const bpjsPcareConfigDelegate = {
    findFirst: jest.fn(() => Promise.resolve(configRow === null ? null : { ...configRow })),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      configRow = {
        id: configRowId,
        credentialKeyVersion: 1,
        isActive: true,
        lastTestedAt: null,
        lastTestResult: null,
        createdAt: new Date('2026-08-01T09:00:00.000Z'),
        updatedAt: new Date('2026-08-01T09:00:00.000Z'),
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
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    bpjsPcareConfig: bpjsPcareConfigDelegate,
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

  function encryptPcareResponse(timestamp: string, payload: unknown): string {
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
    const hash = createHash('sha256')
      .update(`${inputConsId}${inputSecretKey}${timestamp}`)
      .digest();
    const cipher = createCipheriv('aes-256-cbc', hash, hash.subarray(0, 16));
    return Buffer.concat([cipher.update(compressed, 'utf8'), cipher.final()]).toString('base64');
  }

  function stubPoliTransportVerifyingSignature(): void {
    fetchMock.mockImplementation((_url: string | URL, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      const timestamp = headers['X-Timestamp'] ?? '';
      const expectedSignature = createHmac('sha256', inputSecretKey)
        .update(`${inputConsId}&${timestamp}`)
        .digest('base64');
      if (headers['X-Signature'] !== expectedSignature) {
        return Promise.resolve(new Response('bad signature', { status: 401 }));
      }
      const body = JSON.stringify({
        metaData: { code: '200', message: 'OK' },
        response: encryptPcareResponse(timestamp, {
          list: [{ kdPoli: '001', nmPoli: 'POLI UMUM' }],
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
      .get('/api/v1/v1/bpjs/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 404 before any configuration is stored', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');

    await request(app.getHttpServer())
      .get('/api/v1/v1/bpjs/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('rejects a first save that omits a secret', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    const bodyWithoutPassword = { ...inputCreateBody, pcarePassword: undefined };

    await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/config')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyWithoutPassword)
      .expect(400);
  });

  it('creates, masks, updates without re-sending secrets, and never echoes a secret', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');

    const createResponse = await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/config')
      .set('Authorization', `Bearer ${token}`)
      .send(inputCreateBody)
      .expect(200);
    expect(createResponse.body.data).toMatchObject({
      environment: 'DEVELOPMENT',
      hasSecretKey: true,
      secretKeyLast4: inputSecretKey.slice(-4),
      hasUserKey: true,
      userKeyLast4: inputUserKey.slice(-4),
      hasPcarePassword: true,
    });
    expect(JSON.stringify(createResponse.body)).not.toContain(inputSecretKey);
    expect(JSON.stringify(createResponse.body)).not.toContain(inputPcarePassword);

    const storedCiphertext = (configRow as Record<string, unknown>).secretKeyCiphertext;
    expect(String(storedCiphertext)).not.toContain(inputSecretKey);

    const updateResponse = await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/config')
      .set('Authorization', `Bearer ${token}`)
      .send({
        environment: 'PRODUCTION',
        consId: inputConsId,
        kdProviderPpk: '01000101',
        pcareUsername: 'klinik-demo',
        isActive: true,
      })
      .expect(200);
    expect(updateResponse.body.data.environment).toBe('PRODUCTION');
    expect(updateResponse.body.data.secretKeyLast4).toBe(inputSecretKey.slice(-4));
    expect((configRow as Record<string, unknown>).secretKeyCiphertext).toBe(storedCiphertext);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BPJS_CONFIG_CREATED' }),
    );
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BPJS_CONFIG_UPDATED' }),
    );
  });

  it('test-connection signs with the stored credentials and decodes the encrypted reply', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/config')
      .set('Authorization', `Bearer ${token}`)
      .send(inputCreateBody)
      .expect(200);
    stubPoliTransportVerifyingSignature();

    const testResponse = await request(app.getHttpServer())
      .post('/api/v1/v1/bpjs/config/test-connection')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(testResponse.body.data.isSuccessful).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const readResponse = await request(app.getHttpServer())
      .get('/api/v1/v1/bpjs/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(readResponse.body.data.lastTestResult).toContain('OK');
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BPJS_CONNECTION_TESTED',
        metadata: { isSuccessful: true },
      }),
    );
  });

  it('test-connection reports an unreachable upstream as a failed outcome', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/config')
      .set('Authorization', `Bearer ${token}`)
      .send(inputCreateBody)
      .expect(200);
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response('bad gateway', { status: 502 })),
    );

    const testResponse = await request(app.getHttpServer())
      .post('/api/v1/v1/bpjs/config/test-connection')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(testResponse.body.data.isSuccessful).toBe(false);
    expect(testResponse.body.data.message).toContain('BPJS_PCARE_UNAVAILABLE');
    expect((configRow as Record<string, unknown>).lastTestResult).toContain('FAILED');
  });

  it('deletes the configuration and audits it', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/config')
      .set('Authorization', `Bearer ${token}`)
      .send(inputCreateBody)
      .expect(200);

    await request(app.getHttpServer())
      .delete('/api/v1/v1/bpjs/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(configRow).toBeNull();
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BPJS_CONFIG_DELETED' }),
    );
    await request(app.getHttpServer())
      .get('/api/v1/v1/bpjs/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
