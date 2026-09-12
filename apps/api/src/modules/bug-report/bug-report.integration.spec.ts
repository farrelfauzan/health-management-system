import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';

const BUG_REPORTS_PATH = '/api/v1/v1/bug-reports';

const CLEAN_REPORT = {
  title: 'Tombol simpan tidak berfungsi',
  description: 'Saya menekan simpan di halaman pasien dan tidak terjadi apa-apa.',
  pagePath: '/admin/patients',
  requestIds: ['3f1a9c7e-2b4d-4f8a-9c1e-7d5b8a2f6e04'],
  acknowledgedNoSensitiveData: true,
};

/**
 * P23-T08 surface tests. Auth and Prisma are stubbed; the controller, the
 * permission guard, the feature guard, the Zod DTO, the service and its
 * sensitive-data re-check all run for real — so a green run proves the whole
 * chain, including that `create BugReport` is what opens the door and that a
 * PATIENT never gets in.
 *
 * The repository is stubbed at the Prisma delegate rather than replaced, so the
 * quota transaction and the reference allocation are exercised as written.
 */
describe('Bug report intake integration', () => {
  const TEST_ENV: Record<string, string> = {
    PATIENT_MRN_PREFIX: 'RM',
    PATIENT_MRN_WIDTH: '8',
    SATUSEHAT_WORKER_ENABLED: 'false',
    BPJS_WORKER_ENABLED: 'false',
    DELIVERY_WORKER_ENABLED: 'false',
  };
  const previousEnv: Record<string, string | undefined> = {};

  let app: INestApplication;
  let jwtService: JwtService;
  let accessTokenSecret: string;
  let featureAvailabilityCache: FeatureAvailabilityCacheService;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  let filedInWindow = 0;
  let allocatedReference = 123;
  let disabledFeatures: string[] = [];

  /**
   * A stub that behaves like the real transaction: the callback receives a
   * client whose count, raw allocation and create all answer, so the service's
   * quota logic and reference formatting run rather than being mocked away.
   */
  const transactionClientMock = {
    $executeRaw: jest.fn(() => Promise.resolve(1)),
    $queryRaw: jest.fn(() => Promise.resolve([{ allocated: BigInt(allocatedReference) }])),
    bugReport: {
      count: jest.fn(() => Promise.resolve(filedInWindow)),
      create: jest.fn((args: { data: { reference: string } }) =>
        Promise.resolve({
          id: '9f2b1c44-5d6e-4a7b-8c9d-0e1f2a3b4c5d',
          reference: args.data.reference,
          status: 'RECEIVED',
          createdAt: new Date('2026-09-12T04:00:00.000Z'),
        }),
      ),
    },
  };

  const prismaServiceMock = {
    featureEntitlement: {
      findMany: jest.fn(() =>
        Promise.resolve(disabledFeatures.map((featureKey) => ({ featureKey, isEnabled: false }))),
      ),
    },
    userRole: {
      findFirst: jest.fn(() => Promise.resolve({ role: { code: 'DOCTOR' } })),
    },
    bugReport: { count: jest.fn(() => Promise.resolve(filedInWindow)) },
    $transaction: jest.fn((callback: (client: unknown) => Promise<unknown>) =>
      callback(transactionClientMock),
    ),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  function buildToken(): Promise<string> {
    return jwtService.signAsync(
      { sub: 'reporter-user', email: 'dokter@klinik.test' },
      { secret: accessTokenSecret },
    );
  }

  function mockActorWithPermissions(
    roleCode: string,
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'reporter-user',
      roles: [
        {
          role: {
            code: roleCode,
            permissions: permissions.map((permission) => ({ permission })),
          },
        },
      ],
    });
  }

  /** A doctor holding the seeded grant — not a super admin's catalog-wide one. */
  function mockReporterPermission(): void {
    mockActorWithPermissions('DOCTOR', [
      { action: 'create', resource: 'BugReport', scope: 'OWN' },
    ]);
  }

  async function postReport(body: Record<string, unknown>): Promise<request.Response> {
    const token = await buildToken();
    return request(app.getHttpServer())
      .post(BUG_REPORTS_PATH)
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'IntegrationTest/1.0')
      .send(body);
  }

  beforeAll(async () => {
    for (const [key, value] of Object.entries(TEST_ENV)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
    featureAvailabilityCache = moduleRef.get(FeatureAvailabilityCacheService);
    accessTokenSecret =
      moduleRef.get(ConfigService).get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret';
  });

  afterAll(async () => {
    await app.close();
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
    filedInWindow = 0;
    allocatedReference = 123;
    disabledFeatures = [];
    // The guard caches entitlements, so a stub flipped without this is read
    // from the previous test's cache and the switch appears to do nothing.
    featureAvailabilityCache.invalidate();
    mockReporterPermission();
  });

  describe('the happy path', () => {
    it('answers 202 with a BR- reference and a RECEIVED status', async () => {
      const actualResponse = await postReport(CLEAN_REPORT);

      expect(actualResponse.status).toBe(202);
      expect(actualResponse.body).toEqual({
        data: { reference: 'BR-000123', status: 'RECEIVED' },
      });
    });

    it('stores the report as RECEIVED with the reporter role frozen on it', async () => {
      await postReport(CLEAN_REPORT);

      expect(transactionClientMock.bugReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reference: 'BR-000123',
            reporterUserId: 'reporter-user',
            reporterRole: 'DOCTOR',
          }),
        }),
      );
    });

    it('records the submission audit entry with lengths and never the text', async () => {
      await postReport(CLEAN_REPORT);

      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BUG_REPORT_SUBMITTED',
          metadata: expect.objectContaining({
            reference: 'BR-000123',
            reporterRole: 'DOCTOR',
            descriptionLength: CLEAN_REPORT.description.length,
          }),
        }),
      );
      const actualAuditCalls = JSON.stringify(auditServiceMock.record.mock.calls);
      expect(actualAuditCalls).not.toContain(CLEAN_REPORT.description);
      expect(actualAuditCalls).not.toContain(CLEAN_REPORT.title);
    });
  });

  describe('sensitive data', () => {
    it.each([
      ['NIK', 'description', 'NIK pasien 3171012345678901 tidak tersimpan'],
      ['PHONE', 'description', 'tidak bisa menghubungi 0812-3456-7890'],
      ['EMAIL', 'description', 'undangan ke budi@klinik.co.id gagal'],
      ['BPJS_NUMBER', 'description', 'kartu BPJS 0001234567890 ditolak'],
      ['SECRET', 'description', 'saya coba password: hunter2 lalu gagal'],
    ])('refuses a report carrying a %s with 400 SENSITIVE_DATA_DETECTED', async (
      expectedCategory,
      field,
      value,
    ) => {
      const actualResponse = await postReport({ ...CLEAN_REPORT, [field]: value });

      expect(actualResponse.status).toBe(400);
      expect(actualResponse.body.error.code).toBe('SENSITIVE_DATA_DETECTED');
      expect(JSON.stringify(actualResponse.body)).toContain(expectedCategory);
    });

    it('refuses an MRN, which only the API knows the format of', async () => {
      const actualResponse = await postReport({
        ...CLEAN_REPORT,
        description: 'rekam medis RM00001234 kosong',
      });

      expect(actualResponse.status).toBe(400);
      expect(actualResponse.body.error.code).toBe('SENSITIVE_DATA_DETECTED');
    });

    it('stores nothing when a report is refused', async () => {
      await postReport({ ...CLEAN_REPORT, description: 'NIK 3171012345678901 gagal' });

      expect(transactionClientMock.bugReport.create).not.toHaveBeenCalled();
    });

    it('never echoes the matched value back to the reporter', async () => {
      const inputNik = '3171012345678901';

      const actualResponse = await postReport({
        ...CLEAN_REPORT,
        description: `NIK ${inputNik} gagal disimpan`,
      });

      expect(JSON.stringify(actualResponse.body)).not.toContain(inputNik);
    });

    it('records the rejection with the category only', async () => {
      await postReport({ ...CLEAN_REPORT, description: 'NIK 3171012345678901 gagal' });

      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BUG_REPORT_REJECTED_SENSITIVE',
          metadata: expect.objectContaining({ category: 'NIK', field: 'description' }),
        }),
      );
    });
  });

  describe('the confirmation tick', () => {
    it('refuses a report that was never acknowledged', async () => {
      const actualResponse = await postReport({
        ...CLEAN_REPORT,
        acknowledgedNoSensitiveData: false,
      });

      expect(actualResponse.status).toBe(400);
      expect(transactionClientMock.bugReport.create).not.toHaveBeenCalled();
    });
  });

  describe('access', () => {
    it('refuses a PATIENT with 403, whatever else they hold', async () => {
      mockActorWithPermissions('PATIENT', [
        { action: 'read', resource: 'Patient', scope: 'OWN' },
      ]);

      const actualResponse = await postReport(CLEAN_REPORT);

      expect(actualResponse.status).toBe(403);
    });

    it('refuses an unauthenticated request with 401', async () => {
      const actualResponse = await request(app.getHttpServer())
        .post(BUG_REPORTS_PATH)
        .send(CLEAN_REPORT);

      expect(actualResponse.status).toBe(401);
    });

    it('refuses everyone with FEATURE_DISABLED when bug reporting is off', async () => {
      disabledFeatures = ['bug-reporting'];
      featureAvailabilityCache.invalidate();

      const actualResponse = await postReport(CLEAN_REPORT);

      expect(actualResponse.status).toBe(403);
      expect(actualResponse.body.error.code).toBe('FEATURE_DISABLED');
    });
  });

  describe('the daily limit', () => {
    it('accepts the tenth report of the day', async () => {
      filedInWindow = 9;

      const actualResponse = await postReport(CLEAN_REPORT);

      expect(actualResponse.status).toBe(202);
    });

    it('refuses the eleventh with 429', async () => {
      filedInWindow = 10;

      const actualResponse = await postReport(CLEAN_REPORT);

      expect(actualResponse.status).toBe(429);
      expect(actualResponse.body.error.code).toBe('TOO_MANY_REQUESTS');
    });
  });

  describe('technical details', () => {
    it('strips the query string from the page path before storing it', async () => {
      await postReport({
        ...CLEAN_REPORT,
        pagePath: '/admin/patients?nik=3171012345678901&tab=all',
      });

      expect(transactionClientMock.bugReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pagePath: '/admin/patients' }),
        }),
      );
    });

    it('stores the user agent from the request header', async () => {
      await postReport(CLEAN_REPORT);

      expect(transactionClientMock.bugReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userAgent: 'IntegrationTest/1.0' }),
        }),
      );
    });

    it('refuses more than five request ids', async () => {
      const actualResponse = await postReport({
        ...CLEAN_REPORT,
        requestIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      });

      expect(actualResponse.status).toBe(400);
    });
  });
});
