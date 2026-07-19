import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { PharmacyFlowRepository } from './repository/pharmacy-flow.repository';

describe('PharmacyFlow integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const prescriptionId = '0d9b34a1-7c2f-4bd0-8a8e-6a3c1de1a001';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const doctorId = '7f0f4be2-6d51-4bfb-a4c8-2f6a1de1a003';
  const medicationId = '9a1f34c8-8e10-4d0e-8c31-4f6a1de1a004';

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const pharmacyRepositoryMock = {
    listMedications: jest.fn(),
    findActiveMedicationsByIds: jest.fn(),
    findActivePatientById: jest.fn(),
    findActiveDoctorById: jest.fn(),
    findActiveDoctorByOwnerUserId: jest.fn(),
    findActiveDoctorPatientAssignment: jest.fn(),
    findPrescriptionDetailById: jest.fn(),
    createPrescription: jest.fn(),
    createDispense: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const medicationRecord = {
    id: medicationId,
    code: 'MED-0001',
    name: 'Amoxicillin',
    form: 'capsule',
    strength: '500',
    unit: 'mg',
    stockQty: 100,
    createdAt: new Date('2026-07-19T08:00:00.000Z'),
    updatedAt: new Date('2026-07-19T08:00:00.000Z'),
  };

  const prescriptionRecord = {
    id: prescriptionId,
    patientId,
    doctorId,
    status: 'ISSUED',
    issuedAt: new Date('2026-07-19T08:00:00.000Z'),
    notes: null,
    createdAt: new Date('2026-07-19T08:00:00.000Z'),
    updatedAt: new Date('2026-07-19T08:00:00.000Z'),
    patient: {
      id: patientId,
      mrn: 'MRN-0001',
      fullName: 'Patient One',
      ownerUserId: null,
    },
    doctor: {
      id: doctorId,
      licenseNumber: 'LIC-0001',
      fullName: 'Doctor One',
      ownerUserId: null,
    },
    items: [
      {
        id: 'c1b2a3d4-1111-4222-8333-9f6a1de1a006',
        medicationId,
        dosage: '500 mg',
        frequency: '3x daily',
        durationDays: 5,
        quantity: 15,
        instructions: null,
        medication: {
          id: medicationId,
          code: 'MED-0001',
          name: 'Amoxicillin',
        },
      },
    ],
    dispenseRecords: [],
  };

  const dispenseRecord = {
    id: 'd4e5f6a7-2222-4333-8444-af6a1de1a007',
    prescriptionId,
    pharmacistId: 'pharmacist-user',
    status: 'DISPENSED',
    dispensedAt: new Date('2026-07-19T09:00:00.000Z'),
    notes: null,
    createdAt: new Date('2026-07-19T09:00:00.000Z'),
    updatedAt: new Date('2026-07-19T09:00:00.000Z'),
    items: [
      {
        id: 'e5f6a7b8-3333-4444-8555-bf6a1de1a008',
        medicationId,
        quantity: 15,
        medication: {
          id: medicationId,
          code: 'MED-0001',
          name: 'Amoxicillin',
        },
      },
    ],
    prescription: {
      status: 'DISPENSED',
    },
  };

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync(
      {
        sub,
        email,
      },
      {
        secret: 'dev-access-secret',
      },
    );
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
      .overrideProvider(PharmacyFlowRepository)
      .useValue(pharmacyRepositoryMock)
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

    pharmacyRepositoryMock.listMedications.mockResolvedValue({
      items: [medicationRecord],
      total: 1,
      page: 1,
      limit: 10,
    });
    pharmacyRepositoryMock.findActiveMedicationsByIds.mockResolvedValue([
      {
        id: medicationId,
        code: 'MED-0001',
        name: 'Amoxicillin',
        stockQty: 100,
      },
    ]);
    pharmacyRepositoryMock.findActivePatientById.mockResolvedValue({
      id: patientId,
      ownerUserId: null,
    });
    pharmacyRepositoryMock.findActiveDoctorById.mockResolvedValue({
      id: doctorId,
      ownerUserId: null,
    });
    pharmacyRepositoryMock.findActiveDoctorByOwnerUserId.mockResolvedValue({
      id: doctorId,
      ownerUserId: 'doctor-user',
    });
    pharmacyRepositoryMock.findActiveDoctorPatientAssignment.mockResolvedValue({
      id: 'assignment-1',
    });
    pharmacyRepositoryMock.findPrescriptionDetailById.mockResolvedValue(prescriptionRecord);
    pharmacyRepositoryMock.createPrescription.mockResolvedValue(prescriptionRecord);
    pharmacyRepositoryMock.createDispense.mockResolvedValue(dispenseRecord);
  });

  describe('GET /medications', () => {
    it('returns 401 when bearer token is missing', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/v1/medications');

      expect(response.status).toBe(401);
    });

    it('returns 403 when user lacks medication.read permission', async () => {
      const token = await buildToken('no-read-user', 'no-read@hms.local');
      mockActorWithPermissions([{ action: 'read', resource: 'Patient', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/v1/medications')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('returns 200 for medication list with medication.read:any permission', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'read', resource: 'Medication', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/v1/medications')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].stockQty).toBe(100);
    });
  });

  describe('POST /prescriptions', () => {
    const createPayload = {
      patientId,
      doctorId,
      items: [
        {
          medicationId,
          dosage: '500 mg',
          frequency: '3x daily',
          quantity: 15,
        },
      ],
    };

    it('returns 403 when user lacks prescription.write permission', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/prescriptions')
        .set('Authorization', `Bearer ${token}`)
        .send(createPayload);

      expect(response.status).toBe(403);
      expect(pharmacyRepositoryMock.createPrescription).not.toHaveBeenCalled();
    });

    it('returns 201 for prescription creation with write:any permission', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'Prescription', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/prescriptions')
        .set('Authorization', `Bearer ${token}`)
        .send(createPayload);

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('ISSUED');
      expect(pharmacyRepositoryMock.createPrescription).toHaveBeenCalledWith(
        expect.objectContaining({ patientId, doctorId }),
      );
    });

    it('returns 201 for write:own prescription on an actively assigned patient', async () => {
      const token = await buildToken('doctor-user', 'doctor@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'Prescription', scope: 'OWN' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/prescriptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...createPayload, doctorId: undefined });

      expect(response.status).toBe(201);
      expect(pharmacyRepositoryMock.findActiveDoctorPatientAssignment).toHaveBeenCalledWith(
        doctorId,
        patientId,
      );
    });

    it('returns 403 for write:own prescription without an active assignment', async () => {
      const token = await buildToken('doctor-user', 'doctor@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'Prescription', scope: 'OWN' }]);
      pharmacyRepositoryMock.findActiveDoctorPatientAssignment.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/prescriptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...createPayload, doctorId: undefined });

      expect(response.status).toBe(403);
      expect(pharmacyRepositoryMock.createPrescription).not.toHaveBeenCalled();
    });

    it('returns 400 for a prescription with duplicate medications', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'Prescription', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/prescriptions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...createPayload,
          items: [...createPayload.items, ...createPayload.items],
        });

      expect(response.status).toBe(400);
      expect(pharmacyRepositoryMock.createPrescription).not.toHaveBeenCalled();
    });

    it('returns 400 for a prescription without items', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'Prescription', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/prescriptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...createPayload, items: [] });

      expect(response.status).toBe(400);
      expect(pharmacyRepositoryMock.createPrescription).not.toHaveBeenCalled();
    });
  });

  describe('POST /dispenses', () => {
    const dispensePayload = {
      prescriptionId,
      items: [
        {
          medicationId,
          quantity: 15,
        },
      ],
    };

    it('returns 403 when user lacks dispense.write permission', async () => {
      const token = await buildToken('doctor-user', 'doctor@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'Prescription', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/dispenses')
        .set('Authorization', `Bearer ${token}`)
        .send(dispensePayload);

      expect(response.status).toBe(403);
      expect(pharmacyRepositoryMock.createDispense).not.toHaveBeenCalled();
    });

    it('returns 403 when user only has an own-scoped dispense permission', async () => {
      const token = await buildToken('own-user', 'own@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'OWN' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/dispenses')
        .set('Authorization', `Bearer ${token}`)
        .send(dispensePayload);

      expect(response.status).toBe(403);
      expect(pharmacyRepositoryMock.createDispense).not.toHaveBeenCalled();
    });

    it('returns 201 for a full dispense with dispense.write:any permission', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/dispenses')
        .set('Authorization', `Bearer ${token}`)
        .send(dispensePayload);

      expect(response.status).toBe(201);
      expect(response.body.data.prescriptionStatus).toBe('DISPENSED');
      expect(pharmacyRepositoryMock.createDispense).toHaveBeenCalledWith(
        expect.objectContaining({ pharmacistId: 'pharmacist-user' }),
      );
    });

    it('returns 409 when the prescription is not dispensable', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);
      pharmacyRepositoryMock.findPrescriptionDetailById.mockResolvedValue({
        ...prescriptionRecord,
        status: 'DISPENSED',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/dispenses')
        .set('Authorization', `Bearer ${token}`)
        .send(dispensePayload);

      expect(response.status).toBe(409);
      expect(pharmacyRepositoryMock.createDispense).not.toHaveBeenCalled();
    });

    it('returns 409 when quantity exceeds the remaining prescribed quantity', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);
      pharmacyRepositoryMock.findPrescriptionDetailById.mockResolvedValue({
        ...prescriptionRecord,
        status: 'PARTIALLY_DISPENSED',
        dispenseRecords: [
          {
            id: 'previous-dispense',
            status: 'DISPENSED',
            items: [{ medicationId, quantity: 10 }],
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/dispenses')
        .set('Authorization', `Bearer ${token}`)
        .send(dispensePayload);

      expect(response.status).toBe(409);
      expect(pharmacyRepositoryMock.createDispense).not.toHaveBeenCalled();
    });

    it('returns 409 when medication stock is insufficient', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);
      pharmacyRepositoryMock.findActiveMedicationsByIds.mockResolvedValue([
        {
          id: medicationId,
          code: 'MED-0001',
          name: 'Amoxicillin',
          stockQty: 5,
        },
      ]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/dispenses')
        .set('Authorization', `Bearer ${token}`)
        .send(dispensePayload);

      expect(response.status).toBe(409);
      expect(pharmacyRepositoryMock.createDispense).not.toHaveBeenCalled();
    });

    it('returns 400 for a dispense with an invalid quantity', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/dispenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          prescriptionId,
          items: [{ medicationId, quantity: 0 }],
        });

      expect(response.status).toBe(400);
      expect(pharmacyRepositoryMock.createDispense).not.toHaveBeenCalled();
    });
  });
});
