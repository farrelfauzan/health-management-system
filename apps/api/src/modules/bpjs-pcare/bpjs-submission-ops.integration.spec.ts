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
 * P11-T05 ops-surface integration tests. Auth and Prisma are mocked (Prisma
 * as in-memory stores), but both crypto services, the submission repository's
 * decrypt boundary, the payload builders, the HTTP client, signing, and the
 * response codec run for real: a retried pendaftaran decrypts the patient's
 * sealed BPJS number, signs the outbound POST, and decodes PCare's encrypted
 * reply — so a green retry proves the whole pipeline the worker runs, driven
 * synchronously through the admin endpoint.
 */
describe('BPJS PCare submission ops integration', () => {
  const TEST_ENV: Record<string, string> = {
    BPJS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 0x44).toString('base64'),
    PATIENT_PII_ENCRYPTION_KEY: Buffer.alloc(32, 0x55).toString('base64'),
    PATIENT_PII_INDEX_KEY: Buffer.alloc(32, 0x66).toString('base64'),
    BPJS_PCARE_RETRY_BASE_DELAY_MS: '1',
    BPJS_PCARE_MAX_RETRY_ATTEMPTS: '0',
    BPJS_WORKER_ENABLED: 'false',
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
  const registrationRowId = '1f2e3d4c-5b6a-7980-a1b2-c3d4e5f6a7b8';
  const failedSubmissionId = '8a7b6c5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d';

  let app: INestApplication;
  let jwtService: JwtService;
  let accessTokenSecret: string;
  let configRow: Record<string, unknown> | null = null;
  let submissionRows: Array<Record<string, unknown>> = [];
  let sealedBpjsNumberCiphertext = '';

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

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

  const registrationDelegate = {
    findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      if (where.id !== registrationRowId) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        id: registrationRowId,
        status: 'CHECKED_IN',
        queueDate: new Date('2026-08-05T00:00:00.000Z'),
        checkedInAt: new Date('2026-08-05T02:00:00.000Z'),
        // Mirrors the columns `findSubmissionSourceData` selects. Kept in step
        // deliberately: this stub *is* the row as far as the repository is
        // concerned, and a field the query reads but the stub omits arrives as
        // `undefined` rather than `null` — which is how P14-T05 first broke
        // this PCare suite.
        poliQueueNumber: 3,
        specialty: { name: 'Poli Umum', bpjsPoliCode: '001' },
        patient: {
          mrn: '00000042',
          phoneNumber: '081200000000',
          bpjsNumberCiphertext: sealedBpjsNumberCiphertext,
          nikCiphertext: null,
        },
        appointment: {
          bpjsBookingCode: null,
          doctor: {
            fullName: 'dr. Sinta Dewi',
            bpjsDoctorCode: '1234',
            specialty: { bpjsPoliCode: '001' },
          },
          session: null,
        },
        encounter: null,
        bpjsSubmissions: submissionRows
          .filter(
            (row) =>
              row.registrationId === registrationRowId &&
              (row.type === 'PENDAFTARAN' || row.type === 'KUNJUNGAN'),
          )
          .map((row) => ({
            type: row.type,
            status: row.status,
            bpjsReferenceNo: row.bpjsReferenceNo,
            submittedKdPoli: row.submittedKdPoli,
          })),
      });
    }),
  };

  const bpjsSubmissionDelegate = {
    findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      if (typeof where.id === 'string') {
        const found = submissionRows.find((row) => row.id === where.id);
        return Promise.resolve(found === undefined ? null : { ...found });
      }
      const key = where.registrationId_type as { registrationId: string; type: string };
      const found = submissionRows.find(
        (row) => row.registrationId === key.registrationId && row.type === key.type,
      );
      return Promise.resolve(found === undefined ? null : { ...found });
    }),
    findMany: jest.fn(({ where, skip, take }: Record<string, never>) => {
      const filters = (where ?? {}) as Record<string, unknown>;
      const matches = submissionRows.filter(
        (row) =>
          (filters.status === undefined || row.status === filters.status) &&
          (filters.type === undefined || row.type === filters.type) &&
          (filters.registrationId === undefined || row.registrationId === filters.registrationId),
      );
      return Promise.resolve(
        matches.slice(Number(skip ?? 0), Number(skip ?? 0) + Number(take ?? 100)).map((row) => ({
          ...row,
        })),
      );
    }),
    count: jest.fn(({ where }: Record<string, never>) => {
      const filters = (where ?? {}) as Record<string, unknown>;
      return Promise.resolve(
        submissionRows.filter(
          (row) =>
            (filters.status === undefined || row.status === filters.status) &&
            (filters.type === undefined || row.type === filters.type) &&
            (filters.registrationId === undefined ||
              row.registrationId === filters.registrationId),
        ).length,
      );
    }),
    update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = submissionRows.find((candidate) => candidate.id === where.id);
      if (row === undefined) {
        return Promise.reject(new Error('Submission row not found'));
      }
      const attempts = data.attempts as { increment?: number } | number | undefined;
      const resolvedAttempts =
        typeof attempts === 'object' && attempts !== null
          ? Number(row.attempts) + (attempts.increment ?? 0)
          : attempts;
      Object.assign(row, data, resolvedAttempts === undefined ? {} : { attempts: resolvedAttempts });
      return Promise.resolve({ ...row });
    }),
    upsert: jest.fn(
      ({
        where,
        create,
      }: {
        where: { registrationId_type: { registrationId: string; type: string } };
        create: Record<string, unknown>;
      }) => {
        const existing = submissionRows.find(
          (row) =>
            row.registrationId === where.registrationId_type.registrationId &&
            row.type === where.registrationId_type.type,
        );
        if (existing !== undefined) {
          return Promise.resolve({ ...existing });
        }
        const created = buildSubmissionRow({ id: `created-${submissionRows.length}`, ...create });
        submissionRows.push(created);
        return Promise.resolve({ ...created });
      },
    ),
  };

  function buildSubmissionRow(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      id: failedSubmissionId,
      registrationId: registrationRowId,
      type: 'PENDAFTARAN',
      status: 'PENDING',
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(),
      lastAttemptAt: null,
      submittedAt: null,
      bpjsReferenceNo: null,
      submittedKdPoli: null,
      createdAt: new Date('2026-08-05T01:00:00.000Z'),
      updatedAt: new Date(),
      ...overrides,
    };
  }

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
    $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    findFirstActive: jest.fn(
      (delegate: { findFirst: (args: unknown) => Promise<unknown> }, args: { where?: object }) =>
        delegate.findFirst({ ...args, where: { ...args.where, deletedAt: null } }),
    ),
    bpjsPcareConfig: bpjsPcareConfigDelegate,
    registration: registrationDelegate,
    bpjsSubmission: bpjsSubmissionDelegate,
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
      { action: 'read', resource: 'BpjsSubmission', scope: 'ANY' },
      { action: 'retry', resource: 'BpjsSubmission', scope: 'ANY' },
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

  function stubPendaftaranTransportVerifyingSignature(): void {
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
      if (!pathname.endsWith('/pendaftaran') || init.method !== 'POST') {
        return Promise.resolve(new Response('unexpected path', { status: 404 }));
      }
      const requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      if (requestBody.noKartu !== inputBpjsNumber || requestBody.kdPoli !== '001') {
        return Promise.resolve(new Response('unexpected body', { status: 400 }));
      }
      const body = JSON.stringify({
        metaData: { code: '201', message: 'OK' },
        response: encryptPcareResponse(timestamp, { message: 'A12' }),
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
    sealedBpjsNumberCiphertext =
      identifierCrypto.encryptSealedIdentifier(inputBpjsNumber).ciphertext;
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
    submissionRows = [
      buildSubmissionRow({
        status: 'FAILED',
        attempts: 3,
        lastError: 'BPJS PCare upstream failure (HTTP 503)',
      }),
    ];
    mockBpjsAdminPermissions();
    stubPendaftaranTransportVerifyingSignature();
  });

  it('refuses the submissions surface without the read permission', async () => {
    mockActorWithPermissions([]);
    const token = await buildToken('actor-user', 'admin@example.com');

    await request(app.getHttpServer())
      .get('/api/v1/v1/bpjs/submissions')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lists submissions filtered by status and registration', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');

    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/v1/bpjs/submissions?status=FAILED&registrationId=${registrationRowId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({
      id: failedSubmissionId,
      type: 'PENDAFTARAN',
      status: 'FAILED',
    });
    expect(listResponse.body.meta).toMatchObject({ page: 1, limit: 10, total: 1 });
    expect(JSON.stringify(listResponse.body)).not.toContain(inputBpjsNumber);
  });

  it('retries a failed pendaftaran through the real decrypt/sign/codec pipeline', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await storeConfiguration(token);

    const retryResponse = await request(app.getHttpServer())
      .post(`/api/v1/v1/bpjs/submissions/${failedSubmissionId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(retryResponse.body.data).toMatchObject({
      status: 'SUBMITTED',
      attempts: 1,
      bpjsReferenceNo: 'A12',
      lastError: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(submissionRows[0]).toMatchObject({ status: 'SUBMITTED', submittedKdPoli: '001' });
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BPJS_SUBMISSION_RETRIED',
        resourceId: failedSubmissionId,
        metadata: expect.objectContaining({ previousAttempts: 3 }),
      }),
    );

    await request(app.getHttpServer())
      .post(`/api/v1/v1/bpjs/submissions/${failedSubmissionId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('settles a PCare business rejection as FAILED again with the readable reason', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await storeConfiguration(token);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            metaData: { code: 412, message: 'Peserta bukan peserta FKTP terdaftar' },
            response: null,
          }),
          { status: 200 },
        ),
      ),
    );

    const retryResponse = await request(app.getHttpServer())
      .post(`/api/v1/v1/bpjs/submissions/${failedSubmissionId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(retryResponse.body.data.status).toBe('FAILED');
    expect(retryResponse.body.data.lastError).toContain('Peserta bukan peserta FKTP terdaftar');
  });

  it('returns 404 for an unknown submission id', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');

    await request(app.getHttpServer())
      .post('/api/v1/v1/bpjs/submissions/9e8d7c6b-5a4f-3e2d-1c0b-a9f8e7d6c5b4/retry')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
