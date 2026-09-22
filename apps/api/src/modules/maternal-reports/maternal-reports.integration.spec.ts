import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { KOHORT_IBU_COLUMNS, MaternalReportEpisodeSource } from '@hms/shared-types';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PdfRendererService } from '../../common/pdf/pdf-renderer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { ClinicProfileRepository } from '../billing/repository/clinic-profile.repository';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';
import { MaternalReportsRepository } from './repository/maternal-reports.repository';

const KOHORT_IBU_PATH = '/api/v1/v1/maternal-reports/kohort-ibu';
const MONTHLY_KIA_PATH = '/api/v1/v1/maternal-reports/monthly-kia';
const BIRTHS_DEATHS_PATH = '/api/v1/v1/maternal-reports/births-deaths';
const READ_PERMISSION = [{ action: 'read', resource: 'MaternalReport', scope: 'ANY' as const }];
const ENCOUNTER_PERMISSION = [{ action: 'read', resource: 'Encounter', scope: 'ANY' as const }];

function buildEpisode(
  id: string,
  villageCode: string | null,
  villageName: string | null,
): MaternalReportEpisodeSource {
  return {
    id,
    patient: {
      id: `patient-${id}`,
      fullName: `Ibu ${id}`,
      nikLast4: '0001',
      dateOfBirth: new Date('1995-01-01T00:00:00.000Z'),
      address: 'Jl. Melati',
      villageCode,
      villageName,
      hasBpjsNumber: false,
    },
    estimatedDeliveryDate: new Date('2026-11-09T00:00:00.000Z'),
    gravida: 1,
    para: 0,
    abortus: 0,
    bloodType: null,
    rhesus: null,
    riskNotes: null,
    antenatalVisits: [
      {
        pregnancyEpisodeId: id,
        visitCode: 'K1M',
        startedAt: new Date('2026-10-10T03:00:00.000Z'),
        heightCm: null,
        muacCm: null,
        tetanusStatus: null,
        counsellingTopics: [],
        caseManagementNotes: null,
        labResults: [],
      },
    ],
    delivery: null,
    postnatalVisits: [],
    postpartumFamilyPlanningMethod: null,
  };
}

/**
 * P25-T15 over the wired stack: guard, feature gate, Zod pipe, envelope, the
 * three answer formats. The repository is replaced — the row builders and
 * indicators have their own unit specs — and the renderer is a mock, because
 * no Gotenberg is reachable in CI.
 */
describe('Maternal reports integration (P25-T15)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const repositoryMock = {
    listEpisodesActiveInMonth: jest.fn(),
    listAntenatalVisitsInMonth: jest.fn(),
    listDeliveriesInMonth: jest.fn(),
    listPostnatalVisitsTouchingMonth: jest.fn(),
    listNewbornsInNeonatalPeriod: jest.fn(),
    listHb0GivenInMonth: jest.fn(),
    listFamilyPlanningLiveInMonth: jest.fn(),
    listDeathsInMonth: jest.fn(),
  };
  const clinicProfileRepositoryMock = {
    findProfile: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
  };
  const pdfRendererMock = { render: jest.fn() };
  const featureAvailabilityCacheMock = {
    isEnabled: jest.fn<Promise<boolean>, [string]>(async () => true),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const prismaServiceMock = { $connect: jest.fn(), $disconnect: jest.fn() };

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
  }

  function mockActorWithPermissions(
    roleCode: string,
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-user',
      roles: [
        {
          role: { code: roleCode, permissions: permissions.map((permission) => ({ permission })) },
        },
      ],
    });
  }

  function requestBinary(path: string, query: Record<string, string>, token: string): request.Test {
    return request(app.getHttpServer())
      .get(path)
      .query(query)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(MaternalReportsRepository)
      .useValue(repositoryMock)
      .overrideProvider(ClinicProfileRepository)
      .useValue(clinicProfileRepositoryMock)
      .overrideProvider(PdfRendererService)
      .useValue(pdfRendererMock)
      .overrideProvider(FeatureAvailabilityCacheService)
      .useValue(featureAvailabilityCacheMock)
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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    featureAvailabilityCacheMock.isEnabled.mockResolvedValue(true);
    clinicProfileRepositoryMock.findProfile.mockResolvedValue({
      name: 'Klinik Bidan Sehati',
      reportingPuskesmasName: 'Puskesmas Cibeunying',
      reportingPuskesmasCode: 'P3273110201',
    });
    repositoryMock.listEpisodesActiveInMonth.mockResolvedValue([
      buildEpisode('a1', 'A', 'Cihaurgeulis'),
      buildEpisode('none', null, null),
    ]);
    repositoryMock.listAntenatalVisitsInMonth.mockResolvedValue([]);
    repositoryMock.listDeliveriesInMonth.mockResolvedValue([]);
    repositoryMock.listPostnatalVisitsTouchingMonth.mockResolvedValue([]);
    repositoryMock.listNewbornsInNeonatalPeriod.mockResolvedValue([]);
    repositoryMock.listHb0GivenInMonth.mockResolvedValue([]);
    repositoryMock.listFamilyPlanningLiveInMonth.mockResolvedValue([]);
    repositoryMock.listDeathsInMonth.mockResolvedValue([]);
    pdfRendererMock.render.mockResolvedValue(new Uint8Array(Buffer.from('%PDF-1.7 kia')));
  });

  it('refuses the registers without maternal-report.read:any, even with encounter.read', async () => {
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions('DOCTOR', ENCOUNTER_PERMISSION);

    const response = await request(app.getHttpServer())
      .get(KOHORT_IBU_PATH)
      .query({ month: '2026-10' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(auditServiceMock.record).not.toHaveBeenCalled();
  });

  it('refuses the registers while the maternal-care feature is off', async () => {
    const token = await buildToken('midwife-user', 'bidan@hms.local');
    mockActorWithPermissions('MIDWIFE', READ_PERMISSION);
    featureAvailabilityCacheMock.isEnabled.mockResolvedValue(false);

    const response = await request(app.getHttpServer())
      .get(MONTHLY_KIA_PATH)
      .query({ month: '2026-10' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FEATURE_DISABLED');
  });

  it('rejects a month that is not YYYY-MM', async () => {
    const token = await buildToken('midwife-user', 'bidan@hms.local');
    mockActorWithPermissions('MIDWIFE', READ_PERMISSION);

    const response = await request(app.getHttpServer())
      .get(KOHORT_IBU_PATH)
      .query({ month: '10/2026' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  it('lets a midwife read the kohort ibu preview, grouped with "Tanpa desa" last', async () => {
    const token = await buildToken('midwife-user', 'bidan@hms.local');
    mockActorWithPermissions('MIDWIFE', READ_PERMISSION);

    const response = await request(app.getHttpServer())
      .get(KOHORT_IBU_PATH)
      .query({ month: '2026-10' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.header).toMatchObject({
      clinicName: 'Klinik Bidan Sehati',
      puskesmasName: 'Puskesmas Cibeunying',
      puskesmasCode: 'P3273110201',
      monthLabel: 'Oktober 2026',
    });
    expect(response.body.data.columns).toHaveLength(53);
    expect(
      response.body.data.groups.map((group: { villageName: string }) => group.villageName),
    ).toEqual(['Cihaurgeulis', 'Tanpa desa']);
    expect(response.body.data.villages).toEqual([
      { code: 'A', name: 'Cihaurgeulis' },
      { code: null, name: 'Tanpa desa' },
    ]);
    expect(response.body.data.totalRows).toBe(2);
    expect(auditServiceMock.record).not.toHaveBeenCalled();
  });

  it('narrows to one village and leaves the mothers without a village out', async () => {
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions('DOCTOR', READ_PERMISSION);

    const response = await request(app.getHttpServer())
      .get(KOHORT_IBU_PATH)
      .query({ month: '2026-10', villageCode: 'A' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.groups).toHaveLength(1);
    expect(response.body.data.totalRows).toBe(1);
    expect(response.body.data.villages).toHaveLength(2);
  });

  it('streams the register as CSV whose header row is the configured columns, audited', async () => {
    const token = await buildToken('midwife-user', 'bidan@hms.local');
    mockActorWithPermissions('MIDWIFE', READ_PERMISSION);

    const response = await request(app.getHttpServer())
      .get(KOHORT_IBU_PATH)
      .query({ month: '2026-10', format: 'csv' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('kohort-ibu-2026-10.csv');
    expect(response.text.charCodeAt(0)).toBe(0xfeff);
    const lines = response.text.slice(1).split('\r\n');
    expect(lines).toContain(KOHORT_IBU_COLUMNS.map((column) => column.label).join(','));
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EXPORT',
        resource: 'maternal-report',
        metadata: expect.objectContaining({ kind: 'kohort-ibu', format: 'CSV' }),
      }),
    );
  });

  it('answers the PDF through the renderer, landscape, audited', async () => {
    const token = await buildToken('midwife-user', 'bidan@hms.local');
    mockActorWithPermissions('MIDWIFE', READ_PERMISSION);

    const response = await requestBinary(
      KOHORT_IBU_PATH,
      { month: '2026-10', format: 'pdf' },
      token,
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect((response.body as Buffer).toString()).toBe('%PDF-1.7 kia');
    const [html, options] = pdfRendererMock.render.mock.calls[0] as [
      string,
      { landscape?: boolean },
    ];
    expect(options.landscape).toBe(true);
    expect(html).toContain('Register Kohort Ibu');
    expect(html).toContain('Desa/Kelurahan: Tanpa desa');
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ format: 'PDF' }) }),
    );
  });

  it('computes the monthly KIA report and exports it as one wide CSV row', async () => {
    const token = await buildToken('midwife-user', 'bidan@hms.local');
    mockActorWithPermissions('MIDWIFE', READ_PERMISSION);
    repositoryMock.listAntenatalVisitsInMonth.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) => ({
        ...buildEpisode(`v${index}`, null, null).antenatalVisits[0],
        visitCode: index === 0 ? 'K1A' : 'K1M',
      })),
    );

    const preview = await request(app.getHttpServer())
      .get(MONTHLY_KIA_PATH)
      .query({ month: '2026-10' })
      .set('Authorization', `Bearer ${token}`);
    const csv = await request(app.getHttpServer())
      .get(MONTHLY_KIA_PATH)
      .query({ month: '2026-10', format: 'csv' })
      .set('Authorization', `Bearer ${token}`);

    expect(preview.status).toBe(200);
    expect(preview.body.data.isProvisionalLayout).toBe(true);
    expect(preview.body.data.indicators.slice(0, 3)).toEqual([
      expect.objectContaining({ id: 'k1', value: 3 }),
      expect.objectContaining({ id: 'k1Murni', value: 2 }),
      expect.objectContaining({ id: 'k1Akses', value: 1 }),
    ]);
    const lines = csv.text.slice(1).split('\r\n');
    const headerIndex = lines.findIndex((line) => line.startsWith('K1 (K1 akses + K1 murni),'));
    expect(headerIndex).toBeGreaterThan(0);
    expect(lines[headerIndex + 1]?.startsWith('3,2,1,0,0,')).toBe(true);
  });

  it('reports the births and deaths with the coverage note in the header', async () => {
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions('DOCTOR', READ_PERMISSION);
    repositoryMock.listDeathsInMonth.mockResolvedValue([
      {
        admissionId: 'adm-1',
        patient: buildEpisode('m', null, null).patient,
        dischargedAt: new Date('2026-10-12T03:20:00.000Z'),
        isRegisteredNewborn: true,
        pregnancyEndDates: [],
      },
    ]);

    const response = await request(app.getHttpServer())
      .get(BIRTHS_DEATHS_PATH)
      .query({ month: '2026-10' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.coverageNote).toContain('Kematian di luar klinik tidak tercatat');
    expect(response.body.data.summary).toEqual({
      liveBirths: 0,
      stillbirths: 0,
      maternalDeaths: 0,
      newbornDeaths: 1,
      otherDeaths: 0,
    });
  });
});
