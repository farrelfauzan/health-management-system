import { ConflictException, INestApplication, VersioningType } from '@nestjs/common';
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
  const stockReceiptId = 'aa1f34c8-8e10-4d0e-8c31-4f6a1de1a010';

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const pharmacyRepositoryMock = {
    listMedications: jest.fn(),
    findMedicationById: jest.fn(),
    findMedicationByCode: jest.fn(),
    findMedicationByKfaCode: jest.fn(),
    createMedication: jest.fn(),
    updateMedication: jest.fn(),
    listPrescriptions: jest.fn(),
    findActiveMedicationsByIds: jest.fn(),
    findActivePatientById: jest.fn(),
    findActiveDoctorById: jest.fn(),
    findActiveDoctorByOwnerUserId: jest.fn(),
    findActiveDoctorPatientAssignment: jest.fn(),
    findPrescriptionDetailById: jest.fn(),
    createPrescription: jest.fn(),
    createDispense: jest.fn(),
    createStockReceipt: jest.fn(),
    listStockReceipts: jest.fn(),
    getInventorySummary: jest.fn(),
    getExpiryReport: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const medicationRecord = {
    id: medicationId,
    code: 'MED-0001',
    kfaCode: '93000001',
    name: 'Amoxicillin',
    form: 'capsule',
    strength: '500 mg',
    unit: 'KAPSUL',
    category: 'OBAT_KERAS',
    stockQty: 100,
    reorderLevel: 20,
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
        stockAllocations: [],
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
        stockAllocations: [],
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
    pharmacyRepositoryMock.listPrescriptions.mockResolvedValue({
      items: [prescriptionRecord],
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
    pharmacyRepositoryMock.findMedicationById.mockResolvedValue(medicationRecord);
    pharmacyRepositoryMock.findMedicationByCode.mockResolvedValue(null);
    pharmacyRepositoryMock.findMedicationByKfaCode.mockResolvedValue(null);
    pharmacyRepositoryMock.createMedication.mockResolvedValue(medicationRecord);
    pharmacyRepositoryMock.updateMedication.mockResolvedValue(medicationRecord);
    pharmacyRepositoryMock.createStockReceipt.mockResolvedValue({
      id: stockReceiptId,
      medicationId,
      batchNumber: 'LOT-01',
      expiryDate: new Date('2028-01-31T00:00:00.000Z'),
      quantity: 100,
      remainingQuantity: 100,
      receivedAt: new Date('2026-07-19T08:00:00.000Z'),
      receivedById: 'pharmacist-user',
      notes: null,
      createdAt: new Date('2026-07-19T08:00:00.000Z'),
      medication: { id: medicationId, code: 'MED-0001', name: 'Amoxicillin' },
      allocations: [],
    });
    pharmacyRepositoryMock.listStockReceipts.mockResolvedValue({
      items: [], total: 0, page: 1, limit: 10,
    });
    pharmacyRepositoryMock.getInventorySummary.mockResolvedValue([]);
    pharmacyRepositoryMock.getExpiryReport.mockResolvedValue([]);
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
      expect(response.body.data[0].kfaCode).toBe('93000001');
      expect(response.body.data[0].unit).toBe('KAPSUL');
      expect(response.body.data[0].category).toBe('OBAT_KERAS');
    });

    it('returns 400 for an unknown category filter', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'read', resource: 'Medication', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/v1/medications?category=OBAT_AJAIB')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /medications', () => {
    const createPayload = {
      code: 'MED-0001',
      kfaCode: '93000001',
      name: 'Amoxicillin',
      form: 'capsule',
      strength: '500 mg',
      unit: 'KAPSUL',
      category: 'OBAT_KERAS',
      reorderLevel: 20,
    };

    it('returns 401 when bearer token is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/medications')
        .send(createPayload);

      expect(response.status).toBe(401);
    });

    it('returns 403 when user lacks medication.create permission', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'read', resource: 'Medication', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/medications')
        .set('Authorization', `Bearer ${token}`)
        .send(createPayload);

      expect(response.status).toBe(403);
    });

    it('returns 201 with medication.create:any permission', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'create', resource: 'Medication', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/medications')
        .set('Authorization', `Bearer ${token}`)
        .send(createPayload);

      expect(response.status).toBe(201);
      expect(response.body.data.kfaCode).toBe('93000001');
      expect(response.body.message).toBe('Medication created');
    });

    it('returns 400 for a non-numeric KFA code', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'create', resource: 'Medication', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/medications')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...createPayload, kfaCode: 'KFA-001' });

      expect(response.status).toBe(400);
    });

    it('rejects legacy stockQty writes', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'create', resource: 'Medication', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/medications')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...createPayload, stockQty: 100 });

      expect(response.status).toBe(400);
    });

    it('returns 409 when the KFA code is already taken', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'create', resource: 'Medication', scope: 'ANY' }]);
      pharmacyRepositoryMock.findMedicationByKfaCode.mockResolvedValue({
        id: 'b62f10d4-2a4f-4f4e-90cf-5f6a1de1a005',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/medications')
        .set('Authorization', `Bearer ${token}`)
        .send(createPayload);

      expect(response.status).toBe(409);
    });
  });

  describe('PATCH /medications/:id', () => {
    it('returns 403 when user lacks medication.update permission', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'read', resource: 'Medication', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/v1/medications/${medicationId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reorderLevel: 50 });

      expect(response.status).toBe(403);
    });

    it('returns 200 with medication.update:any permission', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'update', resource: 'Medication', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/v1/medications/${medicationId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ category: 'OBAT_BEBAS', reorderLevel: 50 });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Medication updated');
    });

    it('returns 400 for an empty update payload', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'update', resource: 'Medication', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/v1/medications/${medicationId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('returns 404 when the medication does not exist', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'update', resource: 'Medication', scope: 'ANY' }]);
      pharmacyRepositoryMock.findMedicationById.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/v1/medications/${medicationId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reorderLevel: 50 });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /prescriptions', () => {
    it('returns 401 when bearer token is missing', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/v1/prescriptions');

      expect(response.status).toBe(401);
    });

    it('returns 403 when user lacks prescription.read permission', async () => {
      const token = await buildToken('no-read-user', 'no-read@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'Prescription', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/v1/prescriptions')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('returns 200 for an unscoped list with prescription.read:any permission', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'read', resource: 'Prescription', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/v1/prescriptions?status=ISSUED')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.total).toBe(1);
      expect(pharmacyRepositoryMock.listPrescriptions).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ISSUED', ownerUserId: undefined }),
      );
    });

    it('returns 200 scoped to the current user with prescription.read:own permission', async () => {
      const token = await buildToken('doctor-user', 'doctor@hms.local');
      mockActorWithPermissions([{ action: 'read', resource: 'Prescription', scope: 'OWN' }]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/v1/prescriptions')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(pharmacyRepositoryMock.listPrescriptions).toHaveBeenCalledWith(
        expect.objectContaining({ ownerUserId: 'doctor-user' }),
      );
    });

    it('returns 400 for an invalid status filter', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'read', resource: 'Prescription', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/v1/prescriptions?status=UNKNOWN')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
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

    it('returns 409 when transactional receipt stock is insufficient', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);
      pharmacyRepositoryMock.createDispense.mockRejectedValue(
        new ConflictException('Insufficient medication stock'),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/dispenses')
        .set('Authorization', `Bearer ${token}`)
        .send(dispensePayload);

      expect(response.status).toBe(409);
      // Unlike the prescription-state conflicts above, a stock shortage is only
      // visible inside the dispense transaction — the repository must be reached
      // for the guarded balance to reject and roll the whole dispense back.
      expect(pharmacyRepositoryMock.createDispense).toHaveBeenCalled();
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

  describe('inventory endpoints', () => {
    it('denies medication-only actors access to inventory summary', async () => {
      const token = await buildToken('doctor-user', 'doctor@hms.local');
      mockActorWithPermissions([{ action: 'read', resource: 'Medication', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/v1/inventory/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('records a receipt with inventory.write:any', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'Inventory', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/inventory/receipts')
        .set('Authorization', `Bearer ${token}`)
        .send({ medicationId, batchNumber: 'LOT-01', expiryDate: '2028-01-31', quantity: 100 });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({ batchNumber: 'LOT-01', remainingQty: 100 });
    });

    it('requires expiry date on new receipts', async () => {
      const token = await buildToken('pharmacist-user', 'pharmacist@hms.local');
      mockActorWithPermissions([{ action: 'write', resource: 'Inventory', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/inventory/receipts')
        .set('Authorization', `Bearer ${token}`)
        .send({ medicationId, batchNumber: 'LOT-01', quantity: 100 });

      expect(response.status).toBe(400);
      expect(pharmacyRepositoryMock.createStockReceipt).not.toHaveBeenCalled();
    });
  });
});
