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
import { NationalIdentifierCryptoService } from '../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';

/**
 * P11-T04 eligibility integration tests. Auth and Prisma are mocked (Prisma
 * as in-memory stores), but both crypto services, the repository decrypt
 * boundary, the HTTP client, signing, and the response codec run for real:
 * the patient's BPJS number is sealed with the real identifier crypto, the
 * fetch stub verifies each request's HMAC signature and asserts the peserta
 * path carries the decrypted card number, and replies are encrypted with the
 * request's own timestamp — so a green check proves decrypt → sign → lookup
 * → decode → cache end to end, plus the day cache and the UNREACHABLE
 * degrade path.
 */
describe('BPJS PCare eligibility integration', () => {
  const TEST_ENV: Record<string, string> = {
    BPJS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 0x44).toString('base64'),
    PATIENT_PII_ENCRYPTION_KEY: Buffer.alloc(32, 0x55).toString('base64'),
    PATIENT_PII_INDEX_KEY: Buffer.alloc(32, 0x66).toString('base64'),
    BPJS_PCARE_RETRY_BASE_DELAY_MS: '1',
    BPJS_PCARE_MAX_RETRY_ATTEMPTS: '0',
    SATUSEHAT_WORKER_ENABLED: 'false',
  };
  const previousEnv: Record<string, string | undefined> = {};

  const inputConsId = '20250001';
  const inputSecretKey = 'spike-secret-key-value';
  const inputBpjsNumber = '0001234567890';
  const inputCreateBody = {
    environment: 'DEVELOPMENT',
    consId: inputConsId,
    kdProviderPpk: '01000101',
    pcareUsername: 'klinik-demo',
    secretKey: inputSecretKey,
    userKey: 'spike-user-key-value',
    pcarePassword: 'spike-password-value',
    isActive: true,
  };
  const patientRowId = '5b4a3c2d-1e0f-9a8b-7c6d-5e4f3a2b1c0d';

  let app: INestApplication;
  let jwtService: JwtService;
  let accessTokenSecret: string;
  let configRow: Record<string, unknown> | null = null;
  let patientRow: Record<string, unknown> | null = null;
  let eligibilityRows: Array<Record<string, unknown>> = [];

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn() };

  const bpjsPcareConfigDelegate = {
    findFirst: jest.fn(() => Promise.resolve(configRow === null ? null : { ...configRow })),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      configRow = {
        id: '3f2a1b0c-9d8e-4f7a-b6c5-d4e3f2a1b0c9',
        credentialKeyVersion: 1,
        isActive: true,
        lastTestedAt: null,
        lastTestResult: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      return Promise.resolve({ ...configRow });
    }),
    update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      configRow = { ...(configRow as Record<string, unknown>), ...data, updatedAt: new Date() };
      return Promise.resolve({ ...configRow });
    }),
    delete: jest.fn(() => Promise.resolve(configRow)),
  };

  const patientProfileDelegate = {
    findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(where.id === patientRowId && patientRow !== null ? { ...patientRow } : null),
    ),
  };

  function findEligibilityRow(
    patientId: unknown,
    checkedDate: unknown,
  ): Record<string, unknown> | undefined {
    return eligibilityRows.find(
      (row) =>
        row.patientId === patientId &&
        (row.checkedDate as Date).getTime() === (checkedDate as Date).getTime(),
    );
  }

  const bpjsEligibilityCheckDelegate = {
    findUnique: jest.fn(
      ({ where }: { where: { patientId_checkedDate: Record<string, unknown> } }) => {
        const found = findEligibilityRow(
          where.patientId_checkedDate.patientId,
          where.patientId_checkedDate.checkedDate,
        );
        return Promise.resolve(found === undefined ? null : { ...found });
      },
    ),
    upsert: jest.fn(
      ({
        where,
        create,
        update,
      }: {
        where: { patientId_checkedDate: Record<string, unknown> };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = findEligibilityRow(
          where.patientId_checkedDate.patientId,
          where.patientId_checkedDate.checkedDate,
        );
        if (existing === undefined) {
          const created = { id: `check-${eligibilityRows.length}`, ...create };
          eligibilityRows.push(created);
          return Promise.resolve({ ...created });
        }
        Object.assign(existing, update);
        return Promise.resolve({ ...existing });
      },
    ),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    findFirstActive: jest.fn(
      (delegate: { findFirst: (args: unknown) => Promise<unknown> }, args: { where?: object }) =>
        delegate.findFirst({ ...args, where: { ...args.where, deletedAt: null } }),
    ),
    bpjsPcareConfig: bpjsPcareConfigDelegate,
    patientProfile: patientProfileDelegate,
    bpjsEligibilityCheck: bpjsEligibilityCheckDelegate,
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

  function mockBpjsAdminPermissions(): void {
    mockActorWithPermissions([
      { action: 'manage', resource: 'BpjsConfig', scope: 'ANY' },
      { action: 'check', resource: 'BpjsEligibility', scope: 'ANY' },
    ]);
  }

  function encryptPcareResponse(timestamp: string, payload: unknown): string {
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
    const hash = createHash('sha256')
      .update(`${inputConsId}${inputSecretKey}${timestamp}`)
      .digest();
    const cipher = createCipheriv('aes-256-cbc', hash, hash.subarray(0, 16));
    return Buffer.concat([cipher.update(compressed, 'utf8'), cipher.final()]).toString('base64');
  }

  function stubPesertaTransportVerifyingSignature(): void {
    fetchMock.mockImplementation((url: string | URL, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      const timestamp = headers['X-Timestamp'] ?? '';
      const expectedSignature = createHmac('sha256', inputSecretKey)
        .update(`${inputConsId}&${timestamp}`)
        .digest('base64');
      if (headers['X-Signature'] !== expectedSignature) {
        return Promise.resolve(new Response('bad signature', { status: 401 }));
      }
      const pathname = new URL(String(url)).pathname;
      if (!pathname.endsWith(`/peserta/${inputBpjsNumber}`)) {
        return Promise.resolve(new Response('unexpected path', { status: 404 }));
      }
      const body = JSON.stringify({
        metaData: { code: '200', message: 'OK' },
        response: encryptPcareResponse(timestamp, {
          noKartu: inputBpjsNumber,
          nama: 'BUDI SANTOSO',
          aktif: true,
          ketAktif: 'AKTIF',
          jnsPeserta: { kode: '11', nama: 'PEKERJA PENERIMA UPAH' },
          jnsKelas: { kode: '1', nama: 'KELAS I' },
          kdProviderPst: { kdProvider: '01000101', nmProvider: 'KLINIK DEMO' },
          pstProl: '0',
          pstPrb: '0',
        }),
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
  }

  async function storeConfiguration(token: string): Promise<void> {
    await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/config')
      .set('Authorization', `Bearer ${token}`)
      .send(inputCreateBody)
      .expect(200);
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

    const identifierCrypto = moduleRef.get(NationalIdentifierCryptoService);
    const sealedBpjsNumber = identifierCrypto.encryptSealedIdentifier(inputBpjsNumber);
    patientRow = {
      id: patientRowId,
      bpjsNumberCiphertext: sealedBpjsNumber.ciphertext,
      nikCiphertext: null,
    };
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
    eligibilityRows = [];
    mockBpjsAdminPermissions();
    stubPesertaTransportVerifyingSignature();
  });

  it('refuses the check without the eligibility permission', async () => {
    mockActorWithPermissions([]);
    const token = await buildToken('actor-user', 'admin@example.com');

    await request(app.getHttpServer())
      .post(`/api/v1/v1/bpjs/eligibility/patients/${patientRowId}/check`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);
  });

  it('checks live through the real decrypt/sign/codec chain, then serves the day cache', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await storeConfiguration(token);

    const liveResponse = await request(app.getHttpServer())
      .post(`/api/v1/v1/bpjs/eligibility/patients/${patientRowId}/check`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    expect(liveResponse.body.data).toMatchObject({
      state: 'ACTIVE',
      isFromCache: false,
      checkedVia: 'BPJS_NUMBER',
    });
    expect(liveResponse.body.data.member).toMatchObject({
      name: 'BUDI SANTOSO',
      memberClass: 'KELAS I',
      isRegisteredHere: true,
    });
    expect(JSON.stringify(liveResponse.body)).not.toContain(inputBpjsNumber);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(eligibilityRows).toHaveLength(1);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BPJS_ELIGIBILITY_CHECKED',
        resourceId: patientRowId,
      }),
    );

    const cachedResponse = await request(app.getHttpServer())
      .post(`/api/v1/v1/bpjs/eligibility/patients/${patientRowId}/check`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    expect(cachedResponse.body.data.isFromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const forcedResponse = await request(app.getHttpServer())
      .post(`/api/v1/v1/bpjs/eligibility/patients/${patientRowId}/check`)
      .set('Authorization', `Bearer ${token}`)
      .send({ force: true })
      .expect(200);

    expect(forcedResponse.body.data.isFromCache).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(eligibilityRows).toHaveLength(1);
  });

  it('degrades to UNREACHABLE on upstream failure without caching it', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await storeConfiguration(token);
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response('bad gateway', { status: 502 })),
    );

    const degradedResponse = await request(app.getHttpServer())
      .post(`/api/v1/v1/bpjs/eligibility/patients/${patientRowId}/check`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    expect(degradedResponse.body.data.state).toBe('UNREACHABLE');
    expect(degradedResponse.body.data.message).toContain('registration can proceed');
    expect(eligibilityRows).toHaveLength(0);

    stubPesertaTransportVerifyingSignature();
    const retryResponse = await request(app.getHttpServer())
      .post(`/api/v1/v1/bpjs/eligibility/patients/${patientRowId}/check`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    expect(retryResponse.body.data.state).toBe('ACTIVE');
  });

  it('returns 404 for an unknown patient', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await storeConfiguration(token);

    await request(app.getHttpServer())
      .post('/api/v1/v1/bpjs/eligibility/patients/9e8d7c6b-5a4f-3e2d-1c0b-a9f8e7d6c5b4/check')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(404);
  });
});
