import { SatusehatSubmissionBundleData } from '@hms/shared-types';
import { INestApplication, NotFoundException, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { DoctorOwnProfileService } from '../doctor-management/service/doctor-own-profile.service';
import { SATUSEHAT_SANDBOX_FIXTURES } from './fixtures/satusehat-sandbox-fixtures';
import { SATUSEHAT_READ_BACK_FIXTURES } from './fixtures/satusehat-read-back-fixtures';
import { SatusehatSubmissionRepository } from './repository/satusehat-submission.repository';

/**
 * P21-T04 over HTTP: who may compare a visit with what SATUSEHAT holds, and
 * that an admitted comparison is audited as a read of that patient's record.
 * `AuditInterceptor` writes after the handler resolves, so a refused request
 * leaves no row — the same as every other audited route.
 *
 * The permission guard, the ownership rule, the audit interceptor, the HTTP
 * client and the comparison all run for real. The repositories, auth and the
 * doctor-profile lookup are stubbed, and the platform is the recorded read-back
 * fixtures served at the fetch transport.
 */
describe('SATUSEHAT record comparison integration', () => {
  const SANDBOX_ENV: Record<string, string> = {
    SATUSEHAT_ORGANIZATION_ID: 'org-100026351',
    SATUSEHAT_CLIENT_ID: 'recorded-client-id',
    SATUSEHAT_CLIENT_SECRET: 'recorded-client-secret',
    SATUSEHAT_LOCATION_ID: 'loc-4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a',
    SATUSEHAT_LOCATION_NAME: 'Ruang Periksa Umum',
    SATUSEHAT_WORKER_ENABLED: 'false',
  };
  const previousEnv: Record<string, string | undefined> = {};

  const encounterId = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
  const patientId = 'f5e4d3c2-b1a0-4918-a7b6-c5d4e3f2a1b0';
  const treatingDoctorId = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
  const routePath = `/api/v1/v1/satusehat/encounters/${encounterId}/record-comparison`;

  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const submissionRepositoryMock = {
    claimDueSubmissions: jest.fn().mockResolvedValue([]),
    findSubmissionById: jest.fn(),
    findEncounterSubmission: jest.fn(),
    findEncounterLabOrderIds: jest.fn(),
    findSubmittedLabReportSubmissionIds: jest.fn(),
    findSubmissionPage: jest.fn(),
    requeueSubmission: jest.fn(),
    requeueLabReportsForEncounter: jest.fn().mockResolvedValue(0),
    findBundleData: jest.fn(),
    findLabReportBundleData: jest.fn(),
    findSubmissionResources: jest.fn(),
    saveAllergyIhsIds: jest.fn(),
    saveImmunizationIhsIds: jest.fn(),
    saveLabReportIhsIds: jest.fn(),
    saveSubmissionResources: jest.fn(),
    markSubmitted: jest.fn(),
    scheduleRetry: jest.fn(),
    markFailed: jest.fn(),
  };

  const doctorOwnProfileServiceMock = {
    resolveOwnDoctorProfileId: jest.fn(),
  };

  const auditServiceMock = {
    record: jest.fn(),
    recordOrThrow: jest.fn(),
  };

  const prismaServiceMock = {
    // `FeatureGuard` reads entitlements through Prisma on every request; no
    // rows means nothing is disabled.
    featureEntitlement: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  function buildBundleData(): SatusehatSubmissionBundleData {
    return {
      encounterId,
      encounterStatus: 'FINISHED',
      patientId,
      patientName: 'Siti Rahayu',
      patientIhsNumber: 'P02478375538',
      doctorId: treatingDoctorId,
      doctorName: 'dr. Budi Santoso',
      practitionerIhsNumber: 'N10000001',
      arrivedAt: new Date('2026-07-27T08:30:00.000Z'),
      startedAt: new Date('2026-07-27T09:00:00.000Z'),
      endedAt: new Date('2026-07-27T09:20:00.000Z'),
      soapNote: {
        subjective: null,
        objective: null,
        assessment: null,
        plan: null,
        prognosis: null,
      },
      admission: null,
      diagnoses: [
        {
          code: 'A90',
          display: 'Dengue fever [classical dengue]',
          type: 'PRIMARY',
          recordedAt: new Date('2026-07-27T09:05:00.000Z'),
        },
      ],
      procedures: [],
      immunizations: [],
      unreportedAllergies: [],
      retractedReportedAllergyCount: 0,
      latestVitalSigns: null,
      prescriptions: [],
      dispenseItems: [],
      encounterLocation: {
        specialtyName: 'Poli Umum',
        specialtyLocationId: null,
        registeredRootLocationId: null,
      },
      antenatalVisit: null,
      postnatalVisit: null,
    };
  }

  function buildJsonResponse(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
  }

  function mockActor(
    roleCode: string,
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-user',
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

  function mockDoctor(): void {
    mockActor('DOCTOR', [
      { action: 'read', resource: 'SatusehatRecord', scope: 'OWN' },
      { action: 'read', resource: 'Encounter', scope: 'OWN' },
    ]);
  }

  beforeAll(async () => {
    for (const [key, value] of Object.entries(SANDBOX_ENV)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }
    global.fetch = fetchMock as unknown as typeof fetch;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(SatusehatSubmissionRepository)
      .useValue(submissionRepositoryMock)
      .overrideProvider(DoctorOwnProfileService)
      .useValue(doctorOwnProfileServiceMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({
      defaultVersion: '1',
      prefix: 'v',
      type: VersioningType.URI,
    });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();

    jwtService = moduleRef.get(JwtService);
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
    submissionRepositoryMock.claimDueSubmissions.mockResolvedValue([]);
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildBundleData());
    submissionRepositoryMock.findEncounterLabOrderIds.mockResolvedValue([]);
    submissionRepositoryMock.findSubmittedLabReportSubmissionIds.mockResolvedValue([]);
    submissionRepositoryMock.findEncounterSubmission.mockResolvedValue({
      id: '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d',
      kind: 'ENCOUNTER',
      encounterId,
      labOrderId: null,
      labOrderNumber: null,
      status: 'SUBMITTED',
      attempts: 1,
      lastError: null,
      nextAttemptAt: new Date('2026-07-27T09:20:00.000Z'),
      lastAttemptAt: new Date('2026-07-27T09:21:00.000Z'),
      submittedAt: new Date('2026-07-27T09:21:00.000Z'),
      satusehatEncounterId: 'ihs-enc-1',
      createdAt: new Date('2026-07-27T09:20:00.000Z'),
      updatedAt: new Date('2026-07-27T09:21:00.000Z'),
    });
    submissionRepositoryMock.findSubmissionResources.mockResolvedValue([
      {
        resourceType: 'Condition',
        outcome: 'SENT',
        skipReason: null,
        satusehatId: 'ihs-cond-1',
        localRecordId: null,
        isBackfilled: false,
      },
    ]);
    doctorOwnProfileServiceMock.resolveOwnDoctorProfileId.mockResolvedValue(treatingDoctorId);
    fetchMock.mockImplementation((url: string | URL) => {
      const requestUrl = String(url);
      if (requestUrl.includes('/oauth2/v1/accesstoken')) {
        return Promise.resolve(buildJsonResponse(SATUSEHAT_SANDBOX_FIXTURES.tokenResponse, 200));
      }
      return Promise.resolve(buildJsonResponse(SATUSEHAT_READ_BACK_FIXTURES.Condition, 200));
    });
  });

  it('returns 401 without a bearer token', async () => {
    const response = await request(app.getHttpServer()).get(routePath);

    expect(response.status).toBe(401);
  });

  it('lets the treating doctor compare the visit, and audits it as a read of the patient', async () => {
    const token = await buildToken('actor-user', 'doctor@hms.local');
    mockDoctor();

    const response = await request(app.getHttpServer())
      .get(routePath)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      encounterId,
      isSubmitted: true,
      hasResourceList: true,
      unreadableResourceCount: 0,
      lines: [expect.objectContaining({ code: 'A90', outcome: 'MATCHES' })],
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContainEqual(
      expect.stringContaining('/Condition/ihs-cond-1'),
    );
    expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'READ',
        resource: 'satusehat-record',
        resourceId: encounterId,
        patientId,
      }),
    );
  });

  it('refuses another doctor with 403 and reads nothing from SATUSEHAT', async () => {
    const token = await buildToken('actor-user', 'colleague@hms.local');
    mockDoctor();
    doctorOwnProfileServiceMock.resolveOwnDoctorProfileId.mockResolvedValue(
      '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a',
    );

    const response = await request(app.getHttpServer())
      .get(routePath)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * ADMIN holds `encounter.read:any` and every SATUSEHAT monitor grant, and
   * none of that reaches clinical content (D-033).
   */
  it('refuses an administrator holding every encounter and SATUSEHAT monitor grant', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActor('ADMIN', [
      { action: 'read', resource: 'Encounter', scope: 'ANY' },
      { action: 'read', resource: 'SatusehatSubmission', scope: 'ANY' },
      { action: 'retry', resource: 'SatusehatSubmission', scope: 'ANY' },
    ]);

    const response = await request(app.getHttpServer())
      .get(routePath)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(submissionRepositoryMock.findBundleData).not.toHaveBeenCalled();
  });

  it('refuses a pharmacist', async () => {
    const token = await buildToken('actor-user', 'pharmacist@hms.local');
    mockActor('PHARMACIST', [{ action: 'read', resource: 'Prescription', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get(routePath)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('answers 404 when the caller has no doctor profile', async () => {
    const token = await buildToken('actor-user', 'doctor@hms.local');
    mockDoctor();
    doctorOwnProfileServiceMock.resolveOwnDoctorProfileId.mockRejectedValue(
      new NotFoundException('No doctor profile is linked to this account'),
    );

    const response = await request(app.getHttpServer())
      .get(routePath)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it('rejects a malformed encounter id with 400', async () => {
    const token = await buildToken('actor-user', 'doctor@hms.local');
    mockDoctor();

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/satusehat/encounters/not-a-uuid/record-comparison')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
  });
});
