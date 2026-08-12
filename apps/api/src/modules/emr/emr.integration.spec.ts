import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { Icd10CodeRepository } from '../terminology/repository/icd10-code.repository';
import { EncounterRepository } from './repository/encounter.repository';

describe('EMR integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const encounterRepositoryMock = {
    listEncounters: jest.fn(),
    findEncounterWithRelationsById: jest.fn(),
    findEncounterDetailById: jest.fn(),
    findEncounterIdByRegistrationId: jest.fn(),
    findRegistrationForEncounter: jest.fn(),
    findActiveDoctorById: jest.fn(),
    findActiveDoctorByOwnerUserId: jest.fn(),
    findActiveDoctorPatientAssignment: jest.fn(),
    createEncounter: jest.fn(),
    updateEncounter: jest.fn(),
    closeEncounter: jest.fn(),
    createVitalSigns: jest.fn(),
    createDiagnosis: jest.fn(),
    findDiagnosisById: jest.fn(),
    softDeleteDiagnosis: jest.fn(),
    createProcedure: jest.fn(),
    findProcedureById: jest.fn(),
    softDeleteProcedure: jest.fn(),
  };

  const icd10CodeRepositoryMock = {
    searchIcd10Codes: jest.fn(),
    findActiveIcd10CodeById: jest.fn(),
  };

  const prismaServiceMock = {
    // SJ-4 writes one audit row per patient-data route, and the write is
    // awaited: an access that cannot be recorded fails the request rather than
    // returning the data. This stub replaces Prisma wholesale, so the delegate
    // has to exist here or every audited route in this suite answers 500.
    auditLog: { create: jest.fn() },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const encounterId = 'a3f1c9b2-5f9d-4a3b-9c7e-2b1a0d9f8e01';
  const registrationId = '0d9b34a1-7c2f-4bd0-8a8e-6a3c1de1a001';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const doctorId = '7c1f2f0a-2f4b-4d6a-9d0a-9c4e1f0b9c11';
  const icd10CodeId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const timestamp = new Date('2026-07-20T08:00:00.000Z');

  const encounterRecord = {
    id: encounterId,
    registrationId,
    patientId,
    doctorId,
    status: 'IN_PROGRESS',
    startedAt: timestamp,
    endedAt: null,
    subjective: null,
    objective: null,
    assessment: null,
    plan: null,
    createdById: 'actor-user',
    createdAt: timestamp,
    updatedAt: timestamp,
    patient: { id: patientId, mrn: '00000001', fullName: 'Aisha Rahman', ownerUserId: null },
    doctor: {
      id: doctorId,
      licenseNumber: 'SIP-2026-0001',
      fullName: 'Dr. Budi Santoso',
      ownerUserId: null,
    },
    _count: { vitalSigns: 1, diagnoses: 0, procedures: 0 },
  };

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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(EncounterRepository)
      .useValue(encounterRepositoryMock)
      .overrideProvider(Icd10CodeRepository)
      .useValue(icd10CodeRepositoryMock)
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
  });

  beforeEach(() => {
    jest.clearAllMocks();
    encounterRepositoryMock.findEncounterWithRelationsById.mockResolvedValue(encounterRecord);
  });

  it('returns 401 when the bearer token is missing', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/encounters');

    expect(response.status).toBe(401);
  });

  it('returns 403 when the user lacks encounter.read permission', async () => {
    const token = await buildToken('no-read-user', 'no-read@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/encounters')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('returns a paginated encounter list for a permitted user', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Encounter', scope: 'ANY' }]);
    encounterRepositoryMock.listEncounters.mockResolvedValue({
      items: [encounterRecord],
      page: 1,
      limit: 10,
      total: 1,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/encounters')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].id).toBe(encounterId);
    expect(response.body.meta).toEqual({ page: 1, limit: 10, total: 1 });
  });

  it('rejects a startedFrom that is not a real calendar date', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Encounter', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/encounters?startedFrom=2026-02-31')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(encounterRepositoryMock.listEncounters).not.toHaveBeenCalled();
  });

  it('opens an encounter from a CHECKED_IN registration', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
    encounterRepositoryMock.findRegistrationForEncounter.mockResolvedValue({
      id: registrationId,
      patientId,
      status: 'CHECKED_IN',
      patient: { id: patientId, ownerUserId: null, isActive: true },
    });
    encounterRepositoryMock.findEncounterIdByRegistrationId.mockResolvedValue(null);
    encounterRepositoryMock.findActiveDoctorById.mockResolvedValue({ id: doctorId });
    encounterRepositoryMock.createEncounter.mockResolvedValue(encounterRecord);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/encounters')
      .set('Authorization', `Bearer ${token}`)
      .send({ registrationId, doctorId });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Encounter opened');
  });

  it('returns 409 when the registration has not checked in', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
    encounterRepositoryMock.findRegistrationForEncounter.mockResolvedValue({
      id: registrationId,
      patientId,
      status: 'PENDING',
      patient: { id: patientId, ownerUserId: null, isActive: true },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/encounters')
      .set('Authorization', `Bearer ${token}`)
      .send({ registrationId, doctorId });

    expect(response.status).toBe(409);
  });

  it('rejects a SOAP patch that names no section', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/v1/encounters/${encounterId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(encounterRepositoryMock.updateEncounter).not.toHaveBeenCalled();
  });

  it('rejects a vitals reading outside the physiological bounds', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/vital-signs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ temperatureCelsius: 368 });

    expect(response.status).toBe(400);
    expect(encounterRepositoryMock.createVitalSigns).not.toHaveBeenCalled();
  });

  it('rejects a vitals request that measures nothing', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/vital-signs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Patient refused measurement' });

    expect(response.status).toBe(400);
  });

  it('records vitals and returns the derived BMI', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
    encounterRepositoryMock.createVitalSigns.mockResolvedValue({
      id: 'vitals-1',
      encounterId,
      heightCm: 160,
      weightKg: 64,
      systolicBloodPressure: 118,
      diastolicBloodPressure: 76,
      pulseRate: null,
      respiratoryRate: null,
      temperatureCelsius: null,
      oxygenSaturation: null,
      notes: null,
      recordedAt: timestamp,
      recordedById: 'actor-user',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/vital-signs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ heightCm: 160, weightKg: 64, systolicBloodPressure: 118, diastolicBloodPressure: 76 });

    expect(response.status).toBe(201);
    expect(response.body.data.bodyMassIndex).toBe(25);
  });

  it('rejects a blood pressure whose systolic does not exceed its diastolic', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/vital-signs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ systolicBloodPressure: 70, diastolicBloodPressure: 90 });

    expect(response.status).toBe(400);
  });

  it('snapshots the catalog code when a diagnosis names an ICD-10 row', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
    icd10CodeRepositoryMock.findActiveIcd10CodeById.mockResolvedValue({
      id: icd10CodeId,
      code: 'J06.9',
      display: 'Acute upper respiratory infection, unspecified',
      displayIndonesian: null,
      category: 'J06',
      chapter: 'X',
      isActive: true,
    });
    encounterRepositoryMock.createDiagnosis.mockResolvedValue({
      id: 'diagnosis-1',
      encounterId,
      icd10CodeId,
      code: 'J06.9',
      display: 'Acute upper respiratory infection, unspecified',
      type: 'PRIMARY',
      notes: null,
      recordedAt: timestamp,
      recordedById: 'actor-user',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/diagnoses`)
      .set('Authorization', `Bearer ${token}`)
      .send({ icd10CodeId, code: 'Z99.9', display: 'Made up', type: 'PRIMARY' });

    expect(response.status).toBe(201);
    expect(response.body.data.code).toBe('J06.9');
  });

  it('rejects a diagnosis with neither a catalog code nor a code and display pair', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/diagnoses`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'J06.9' });

    expect(response.status).toBe(400);
    expect(encounterRepositoryMock.createDiagnosis).not.toHaveBeenCalled();
  });

  it('returns 409 when writing to a closed record', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
    encounterRepositoryMock.findEncounterWithRelationsById.mockResolvedValue({
      ...encounterRecord,
      status: 'FINISHED',
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/diagnoses`)
      .set('Authorization', `Bearer ${token}`)
      .send({ icd10CodeId, type: 'PRIMARY' });

    expect(response.status).toBe(409);
  });

  it('closes the encounter and completes its registration', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
    encounterRepositoryMock.findRegistrationForEncounter.mockResolvedValue({
      id: registrationId,
      patientId,
      status: 'CHECKED_IN',
      patient: { id: patientId, ownerUserId: null, isActive: true },
    });
    encounterRepositoryMock.closeEncounter.mockResolvedValue({
      ...encounterRecord,
      status: 'FINISHED',
      endedAt: timestamp,
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('FINISHED');
    expect(encounterRepositoryMock.closeEncounter).toHaveBeenCalledWith(
      expect.objectContaining({ registrationStatus: 'COMPLETED' }),
    );
  });

  it('retracts a diagnosis that belongs to the encounter', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
    encounterRepositoryMock.findDiagnosisById.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      encounterId,
    });

    const response = await request(app.getHttpServer())
      .delete(`/api/v1/v1/encounters/${encounterId}/diagnoses/11111111-1111-4111-8111-111111111111`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(encounterRepositoryMock.softDeleteDiagnosis).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('returns 404 for a diagnosis recorded on a different encounter', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
    encounterRepositoryMock.findDiagnosisById.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      encounterId: '22222222-2222-4222-8222-222222222222',
    });

    const response = await request(app.getHttpServer())
      .delete(`/api/v1/v1/encounters/${encounterId}/diagnoses/11111111-1111-4111-8111-111111111111`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(encounterRepositoryMock.softDeleteDiagnosis).not.toHaveBeenCalled();
  });
});
