import {
  SatusehatSubmissionBundleData,
  SatusehatSubmissionRecord,
} from '@hms/shared-types';
import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { SATUSEHAT_SANDBOX_FIXTURES } from './fixtures/satusehat-sandbox-fixtures';
import { SatusehatSubmissionRepository } from './repository/satusehat-submission.repository';

/**
 * P10-T06 ops-surface integration tests. The submission repository and auth
 * are mocked, but the token client, HTTP client, FHIR mapper, and submission
 * service all run for real against recorded staging-sandbox fixtures stubbed
 * at the fetch transport — so a retry exercises the same code path the worker
 * uses, end to end.
 */
describe('SATUSEHAT submission ops integration', () => {
  const SANDBOX_ENV: Record<string, string> = {
    SATUSEHAT_ORGANIZATION_ID: 'org-100026351',
    SATUSEHAT_CLIENT_ID: 'recorded-client-id',
    SATUSEHAT_CLIENT_SECRET: 'recorded-client-secret',
    SATUSEHAT_LOCATION_ID: 'loc-4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a',
    SATUSEHAT_LOCATION_NAME: 'Ruang Periksa Umum',
    SATUSEHAT_WORKER_ENABLED: 'false',
  };
  const previousEnv: Record<string, string | undefined> = {};

  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const submissionRepositoryMock = {
    findDueSubmissions: jest.fn().mockResolvedValue([]),
    findSubmissionById: jest.fn(),
    findSubmissionPage: jest.fn(),
    requeueSubmission: jest.fn(),
    findBundleData: jest.fn(),
    markSubmitted: jest.fn(),
    scheduleRetry: jest.fn(),
    markFailed: jest.fn(),
  };

  const auditServiceMock = {
    record: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  const submissionId = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
  const encounterId = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';

  let submissionRow: SatusehatSubmissionRecord;

  function buildFailedRow(): SatusehatSubmissionRecord {
    return {
      id: submissionId,
      encounterId,
      status: 'FAILED',
      attempts: 8,
      lastError: 'SATUSEHAT upstream failure (HTTP 503)',
      nextAttemptAt: new Date('2026-07-28T09:00:00.000Z'),
      lastAttemptAt: new Date('2026-07-28T08:00:00.000Z'),
      submittedAt: null,
      satusehatEncounterId: null,
      createdAt: new Date('2026-07-27T10:15:00.000Z'),
      updatedAt: new Date('2026-07-28T08:00:00.000Z'),
    };
  }

  function buildBundleData(): SatusehatSubmissionBundleData {
    return {
      encounterId,
      encounterStatus: 'FINISHED',
      patientId: 'f5e4d3c2-b1a0-4918-a7b6-c5d4e3f2a1b0',
      patientName: 'Siti Rahayu',
      patientIhsNumber: 'P02478375538',
      doctorId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
      doctorName: 'dr. Budi Santoso',
      practitionerIhsNumber: 'N10000001',
      arrivedAt: new Date('2026-07-27T08:30:00.000Z'),
      startedAt: new Date('2026-07-27T09:00:00.000Z'),
      endedAt: new Date('2026-07-27T09:20:00.000Z'),
      diagnoses: [
        {
          code: 'J06.9',
          display: 'Acute upper respiratory infection, unspecified',
          type: 'PRIMARY',
          recordedAt: new Date('2026-07-27T09:05:00.000Z'),
        },
      ],
      latestVitalSigns: {
        recordedAt: new Date('2026-07-27T08:35:00.000Z'),
        heightCm: 165,
        weightKg: 60,
        systolicBloodPressure: 120,
        diastolicBloodPressure: 80,
        pulseRate: 78,
        respiratoryRate: 18,
        temperatureCelsius: 37.2,
        oxygenSaturation: 98,
      },
      prescriptions: [
        {
          prescriptionId: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
          issuedAt: new Date('2026-07-27T09:15:00.000Z'),
          items: [
            {
              prescriptionItemId: '4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a',
              prescriptionId: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
              medication: {
                medicationId: '5e6f7a8b-9c0d-4e1f-a02b-3c4d5e6f7a8b',
                code: 'PARA-500',
                kfaCode: '93001019',
                name: 'Paracetamol 500 mg Tablet',
                unit: 'TABLET',
              },
              dosage: '500 mg',
              frequency: '3x sehari',
              instructions: 'Sesudah makan',
              quantity: 10,
            },
          ],
        },
      ],
      dispenseItems: [
        {
          dispenseItemId: '6f7a8b9c-0d1e-4f2a-b03c-4d5e6f7a8b9c',
          dispenseRecordId: '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0e',
          prescriptionId: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
          medication: {
            medicationId: '5e6f7a8b-9c0d-4e1f-a02b-3c4d5e6f7a8b',
            code: 'PARA-500',
            kfaCode: '93001019',
            name: 'Paracetamol 500 mg Tablet',
            unit: 'TABLET',
          },
          quantity: 10,
          dispensedAt: new Date('2026-07-27T09:30:00.000Z'),
        },
      ],
    };
  }

  function buildJsonResponse(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function stubSandboxTransport(bundleResponse: () => Response): void {
    fetchMock.mockImplementation((url: string | URL) => {
      const requestUrl = String(url);
      if (requestUrl.includes('/oauth2/v1/accesstoken')) {
        return Promise.resolve(buildJsonResponse(SATUSEHAT_SANDBOX_FIXTURES.tokenResponse, 200));
      }
      return Promise.resolve(bundleResponse());
    });
  }

  function wireStatefulSubmissionRow(): void {
    submissionRow = buildFailedRow();
    submissionRepositoryMock.findSubmissionById.mockImplementation(() =>
      Promise.resolve({ ...submissionRow }),
    );
    submissionRepositoryMock.requeueSubmission.mockImplementation(() => {
      submissionRow = {
        ...submissionRow,
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
      };
      return Promise.resolve({ ...submissionRow });
    });
    submissionRepositoryMock.markSubmitted.mockImplementation(
      (id: string, satusehatEncounterId: string | null) => {
        submissionRow = {
          ...submissionRow,
          status: 'SUBMITTED',
          attempts: submissionRow.attempts + 1,
          lastError: null,
          submittedAt: new Date('2026-07-28T09:05:01.000Z'),
          lastAttemptAt: new Date('2026-07-28T09:05:01.000Z'),
          satusehatEncounterId,
        };
        return Promise.resolve();
      },
    );
    submissionRepositoryMock.markFailed.mockImplementation(
      (payload: { attempts: number; lastError: string }) => {
        submissionRow = {
          ...submissionRow,
          status: 'FAILED',
          attempts: payload.attempts,
          lastError: payload.lastError,
          lastAttemptAt: new Date('2026-07-28T09:05:01.000Z'),
        };
        return Promise.resolve();
      },
    );
    submissionRepositoryMock.scheduleRetry.mockImplementation(
      (payload: { attempts: number; nextAttemptAt: Date; lastError: string }) => {
        submissionRow = {
          ...submissionRow,
          status: 'PENDING',
          attempts: payload.attempts,
          nextAttemptAt: payload.nextAttemptAt,
          lastError: payload.lastError,
          lastAttemptAt: new Date('2026-07-28T09:05:01.000Z'),
        };
        return Promise.resolve();
      },
    );
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildBundleData());
  }

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
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

  function mockOpsPermissions(): void {
    mockActorWithPermissions([
      { action: 'read', resource: 'SatusehatSubmission', scope: 'ANY' },
      { action: 'retry', resource: 'SatusehatSubmission', scope: 'ANY' },
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
    submissionRepositoryMock.findDueSubmissions.mockResolvedValue([]);
  });

  it('returns 401 when the bearer token is missing', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/satusehat/submissions');

    expect(response.status).toBe(401);
  });

  it('returns 403 when the user lacks the submission read permission', async () => {
    const token = await buildToken('no-ops-user', 'no-ops@hms.local');
    mockActorWithPermissions([{ action: 'link', resource: 'Satusehat', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/satusehat/submissions')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('lists submissions with status filter and pagination', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockOpsPermissions();
    submissionRepositoryMock.findSubmissionPage.mockResolvedValue({
      items: [buildFailedRow()],
      total: 1,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/satusehat/submissions?status=FAILED&page=1&limit=20')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(submissionRepositoryMock.findSubmissionPage).toHaveBeenCalledWith({
      status: 'FAILED',
      encounterId: undefined,
      skip: 0,
      take: 20,
    });
    expect(response.body.meta).toEqual({ page: 1, limit: 20, total: 1 });
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: submissionId,
      encounterId,
      status: 'FAILED',
      attempts: 8,
      lastError: 'SATUSEHAT upstream failure (HTTP 503)',
      nextAttemptAt: '2026-07-28T09:00:00.000Z',
    });
  });

  it('rejects an unknown status filter with 400', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockOpsPermissions();

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/satusehat/submissions?status=NOT_A_STATUS')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(submissionRepositoryMock.findSubmissionPage).not.toHaveBeenCalled();
  });

  it('returns 404 when retrying an unknown submission', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockOpsPermissions();
    submissionRepositoryMock.findSubmissionById.mockResolvedValue(null);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/satusehat/submissions/${submissionId}/retry`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(submissionRepositoryMock.requeueSubmission).not.toHaveBeenCalled();
  });

  it('returns 409 when retrying a submission that already succeeded', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockOpsPermissions();
    submissionRepositoryMock.findSubmissionById.mockResolvedValue({
      ...buildFailedRow(),
      status: 'SUBMITTED',
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/satusehat/submissions/${submissionId}/retry`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(submissionRepositoryMock.requeueSubmission).not.toHaveBeenCalled();
  });

  it('retries a FAILED submission against the recorded sandbox success fixture', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockOpsPermissions();
    wireStatefulSubmissionRow();
    stubSandboxTransport(() =>
      buildJsonResponse(SATUSEHAT_SANDBOX_FIXTURES.transactionResponse, 200),
    );

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/satusehat/submissions/${submissionId}/retry`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('SUBMITTED');
    expect(response.body.data.attempts).toBe(1);
    expect(response.body.data.satusehatEncounterId).toBe(
      SATUSEHAT_SANDBOX_FIXTURES.encounterIhsId,
    );
    expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalledWith(
      submissionId,
      SATUSEHAT_SANDBOX_FIXTURES.encounterIhsId,
    );
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SATUSEHAT_SUBMISSION_RETRIED',
        resourceId: submissionId,
        actorUserId: 'actor-user',
      }),
    );
    const bundlePost = fetchMock.mock.calls.find(
      ([url]) => !String(url).includes('/oauth2/v1/accesstoken'),
    );
    expect(bundlePost).toBeDefined();
    const [, bundleRequestInit] = bundlePost as [string, RequestInit];
    const sentBundle = JSON.parse(String(bundleRequestInit.body)) as {
      resourceType: string;
      type: string;
      entry: Array<{ request: { url: string } }>;
    };
    expect(sentBundle.resourceType).toBe('Bundle');
    expect(sentBundle.type).toBe('transaction');
    expect(sentBundle.entry.map((entry) => entry.request.url)).toEqual(
      expect.arrayContaining([
        'Encounter',
        'Condition',
        'Observation',
        'Medication',
        'MedicationRequest',
        'MedicationDispense',
      ]),
    );
    expect(
      (bundleRequestInit.headers as Record<string, string>).Authorization,
    ).toBe('Bearer recorded-sandbox-access-token');
  });

  it('settles the row FAILED again when the sandbox rejects the bundle', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockOpsPermissions();
    wireStatefulSubmissionRow();
    stubSandboxTransport(() =>
      buildJsonResponse(SATUSEHAT_SANDBOX_FIXTURES.operationOutcomeRejection, 400),
    );

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/satusehat/submissions/${submissionId}/retry`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('FAILED');
    expect(response.body.data.attempts).toBe(1);
    expect(response.body.data.lastError).toContain('HTTP 400');
    expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: submissionId, attempts: 1 }),
    );
    expect(submissionRepositoryMock.markSubmitted).not.toHaveBeenCalled();
  });

  it('reschedules the row PENDING when the sandbox is transiently unavailable', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockOpsPermissions();
    wireStatefulSubmissionRow();
    stubSandboxTransport(() =>
      buildJsonResponse(SATUSEHAT_SANDBOX_FIXTURES.operationOutcomeServerError, 503),
    );

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/satusehat/submissions/${submissionId}/retry`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('PENDING');
    expect(response.body.data.attempts).toBe(1);
    expect(response.body.data.lastError).toContain('HTTP 503');
    expect(submissionRepositoryMock.scheduleRetry).toHaveBeenCalledWith(
      expect.objectContaining({ id: submissionId, attempts: 1 }),
    );
  });
});
