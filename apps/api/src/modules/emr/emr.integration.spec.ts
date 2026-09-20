import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { DoctorAuthorityRepository } from '../doctor-management/repository/doctor-authority.repository';
import { DoctorMandateRepository } from '../doctor-management/repository/doctor-mandate.repository';
import { LabOrderRepository } from '../laboratory/repository/lab-order.repository';
import { MaternalCareRepository } from '../maternal-care/repository/maternal-care.repository';
import { PharmacyFlowRepository } from '../pharmacy-flow/repository/pharmacy-flow.repository';
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
    createImmunization: jest.fn(),
  };

  // P24-T12. Recording a vaccination looks the vaccine up in the catalog, and
  // `PrismaService` is stubbed wholesale below, so the pharmacy repository is
  // overridden for the same reason the laboratory one is.
  const pharmacyFlowRepositoryMock = {
    findActiveVaccineById: jest.fn(),
  };

  // P25-T03. A midwife's procedures and under-five visits ask
  // `DoctorAuthorityService.hasActiveAuthority`, which reads this repository.
  // `PrismaService` is stubbed wholesale, so it is overridden here too.
  const doctorAuthorityRepositoryMock = {
    hasActiveAuthority: jest.fn(() => Promise.resolve(false)),
  };

  // P25-T05. The gate now asks for a covering pelimpahan before it refuses,
  // and that read goes through the mandate repository — stubbed for the same
  // reason as the one above.
  const doctorMandateRepositoryMock = {
    findCovering: jest.fn<Promise<{ id: string } | null>, []>(() => Promise.resolve(null)),
  };

  const icd10CodeRepositoryMock = {
    searchIcd10Codes: jest.fn(),
    findActiveIcd10CodeById: jest.fn(),
  };

  // P18-T02. Closing a visit now names the lab work still in flight, and the
  // encounter detail carries its orders. `PrismaService` is stubbed wholesale
  // below, so the laboratory repository has to be overridden here or every
  // close answers 500 — the same reason the audit delegate is stubbed.
  const labOrderRepositoryMock = {
    findLabOrdersByEncounterId: jest.fn(() => Promise.resolve([])),
  };

  const maternalCareRepositoryMock = {
    findVisitByEncounterId: jest.fn(() => Promise.resolve(null)),
    findEpisodeById: jest.fn(() => Promise.resolve(null)),
    listEpisodeVisits: jest.fn(() => Promise.resolve([])),
    freezeVisitCode: jest.fn(() => Promise.resolve(undefined)),
  } as unknown as MaternalCareRepository;

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
  const mandateId = '1b6a6a2e-9d6e-4e58-8a2f-0f0f2c3b4d55';
  const icd10CodeId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const vaccineId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
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
      .overrideProvider(DoctorAuthorityRepository)
      .useValue(doctorAuthorityRepositoryMock)
      .overrideProvider(DoctorMandateRepository)
      .useValue(doctorMandateRepositoryMock)
      .overrideProvider(LabOrderRepository)
      .useValue(labOrderRepositoryMock)
      .overrideProvider(PharmacyFlowRepository)
      .useValue(pharmacyFlowRepositoryMock)
      // P25-T06: closing an encounter asks the maternal module to freeze the
      // K-code onto the antenatal visit it counts as. This spec replaces
      // Prisma wholesale, so that repository has to be stubbed here too —
      // otherwise a close reads 500 for a reason that has nothing to do with
      // the encounter.
      .overrideProvider(MaternalCareRepository)
      .useValue(maternalCareRepositoryMock)
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

  describe('midwife authority enforcement (P25-T03)', () => {
    const midwifeEncounterRecord = {
      ...encounterRecord,
      childVisitPurpose: null,
      doctor: { ...encounterRecord.doctor, nikLast4: null, profession: 'MIDWIFE' },
    };

    it('refuses 69.7 from a midwife without IUD_IMPLANT with the documented envelope', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
      encounterRepositoryMock.findEncounterWithRelationsById.mockResolvedValue(
        midwifeEncounterRecord,
      );
      doctorAuthorityRepositoryMock.hasActiveAuthority.mockResolvedValue(false);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/v1/encounters/${encounterId}/procedures`)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '69.7', display: 'Insertion of contraceptive device' });

      expect(response.status).toBe(422);
      expect(response.body.error).toEqual(
        expect.objectContaining({
          code: 'MIDWIFE_AUTHORITY_REQUIRED',
          details: { kind: 'IUD_IMPLANT' },
        }),
      );
      expect(encounterRepositoryMock.createProcedure).not.toHaveBeenCalled();
      expect(prismaServiceMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'MIDWIFE_AUTHORITY_REFUSED',
          resource: 'encounter-procedure',
          metadata: {
            kind: 'IUD_IMPLANT',
            code: '69.7',
            encounterId,
            doctorId,
          },
        }),
      });
    });

    // P25-T05. A live pelimpahan naming the code lets her record it, and the
    // row says whose responsibility it was.
    it('saves 69.7 under the mandate that covers it, stamping mandate_id', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
      encounterRepositoryMock.findEncounterWithRelationsById.mockResolvedValue(
        midwifeEncounterRecord,
      );
      doctorAuthorityRepositoryMock.hasActiveAuthority.mockResolvedValue(false);
      doctorMandateRepositoryMock.findCovering.mockResolvedValue({ id: mandateId });
      encounterRepositoryMock.createProcedure.mockResolvedValue({
        id: 'ba7a2b6f-0d55-4d21-9a3f-6b1a0d9f8e10',
        encounterId,
        code: '69.7',
        display: 'Insertion of contraceptive device',
        contraceptiveImplantAction: null,
        mandateId,
        notes: null,
        performedAt: new Date('2026-09-15T03:00:00.000Z'),
        recordedById: 'admin-user',
        createdAt: new Date('2026-09-15T03:00:00.000Z'),
        updatedAt: new Date('2026-09-15T03:00:00.000Z'),
        mandate: {
          id: mandateId,
          kind: 'MANDATE',
          mandatingDoctor: { fullName: 'dr. Budi Santoso' },
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/v1/encounters/${encounterId}/procedures`)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '69.7', display: 'Insertion of contraceptive device' });

      expect(response.status).toBe(201);
      expect(encounterRepositoryMock.createProcedure).toHaveBeenCalledWith(
        expect.objectContaining({ code: '69.7', mandateId }),
      );
      expect(response.body.data.mandate).toEqual(
        expect.objectContaining({ id: mandateId, mandatingDoctorName: 'dr. Budi Santoso' }),
      );
      expect(prismaServiceMock.auditLog.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'MIDWIFE_AUTHORITY_REFUSED' }),
        }),
      );
    });

    it('still refuses a gated code the mandate does not name', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
      encounterRepositoryMock.findEncounterWithRelationsById.mockResolvedValue(
        midwifeEncounterRecord,
      );
      doctorAuthorityRepositoryMock.hasActiveAuthority.mockResolvedValue(false);
      // The list is part of the query, so a code outside it simply finds
      // nothing — the same answer as holding no mandate at all.
      doctorMandateRepositoryMock.findCovering.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/v1/encounters/${encounterId}/procedures`)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '97.71', display: 'Removal of intrauterine contraceptive device' });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('MIDWIFE_AUTHORITY_REQUIRED');
      expect(doctorMandateRepositoryMock.findCovering).toHaveBeenCalledWith(
        expect.objectContaining({ icd9cmCode: '97.71', midwifeDoctorId: doctorId }),
      );
      expect(encounterRepositoryMock.createProcedure).not.toHaveBeenCalled();
    });

    it('refuses a SICK_CHILD encounter for a midwife without MTBS and opens nothing', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] });
      jest.setSystemTime(new Date('2026-09-15T03:00:00.000Z'));
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
      encounterRepositoryMock.findRegistrationForEncounter.mockResolvedValue({
        id: registrationId,
        patientId,
        status: 'CHECKED_IN',
        patient: {
          id: patientId,
          ownerUserId: null,
          isActive: true,
          dateOfBirth: new Date('2023-06-01T00:00:00.000Z'),
        },
      });
      encounterRepositoryMock.findEncounterIdByRegistrationId.mockResolvedValue(null);
      encounterRepositoryMock.findActiveDoctorById.mockResolvedValue({
        id: doctorId,
        ownerUserId: null,
        profession: 'MIDWIFE',
      });
      doctorAuthorityRepositoryMock.hasActiveAuthority.mockResolvedValue(false);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/encounters')
        .set('Authorization', `Bearer ${token}`)
        .send({ registrationId, doctorId, childVisitPurpose: 'SICK_CHILD' });
      jest.useRealTimers();

      expect(response.status).toBe(422);
      expect(response.body.error).toEqual(
        expect.objectContaining({ code: 'MIDWIFE_AUTHORITY_REQUIRED', details: { kind: 'MTBS' } }),
      );
      expect(encounterRepositoryMock.createEncounter).not.toHaveBeenCalled();
      expect(prismaServiceMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'MIDWIFE_AUTHORITY_REFUSED', resource: 'encounter' }),
      });
    });
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

  it('refuses a dose given here that has no lot number or expiry (P24-T12)', async () => {
    // SATUSEHAT refuses a primary-source Immunization without either
    // (RuleNumber 10306, 10307), and one refused resource fails the visit.
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/immunizations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ medicationId: vaccineId, reason: 'IM_DASAR', doseNumber: 1 });

    expect(response.status).toBe(400);
    expect(encounterRepositoryMock.createImmunization).not.toHaveBeenCalled();
  });

  it('records a historical dose copied from a KIA book without lot or expiry', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
    pharmacyFlowRepositoryMock.findActiveVaccineById.mockResolvedValue({
      id: vaccineId,
      name: 'Vaksin DPT-HB-Hib',
      kfaCode: '93023055',
    });
    encounterRepositoryMock.createImmunization.mockResolvedValue({
      id: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
      encounterId,
      patientId,
      medicationId: vaccineId,
      medicationName: 'Vaksin DPT-HB-Hib',
      kfaCode: '93023055',
      occurredAt: timestamp,
      lotNumber: null,
      expirationDate: null,
      doseNumber: 1,
      route: null,
      site: null,
      performedById: doctorId,
      performedByName: 'Dr. Budi Santoso',
      notes: null,
      isHistorical: true,
      reason: 'IM_DASAR',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/immunizations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ medicationId: vaccineId, isHistorical: true, reason: 'IM_DASAR', doseNumber: 1 });

    expect(response.status).toBe(201);
    expect(response.body.data.isHistorical).toBe(true);
    expect(response.body.data.reason).toBe('IM_DASAR');
    expect(encounterRepositoryMock.createImmunization).toHaveBeenCalledWith(
      expect.objectContaining({ isHistorical: true, reason: 'IM_DASAR', performedById: doctorId }),
    );
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
