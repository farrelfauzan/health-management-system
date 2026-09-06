import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionScope } from '../../generated/prisma/client';

/**
 * One patient, one visit, one bill — end to end over HTTP against real
 * Postgres.
 *
 * The journey the clinic actually runs, in the order the front desk,
 * the doctor, the pharmacist and the cashier run it: the patient is
 * registered with the privacy notice, joins today's queue and is checked
 * in; the doctor opens the encounter, records vitals, a diagnosis and a
 * procedure, writes a prescription and closes the visit; the pharmacist
 * dispenses; the cashier generates the invoice, issues it, takes cash, and
 * finds it on the day's report. Every step goes through the public route
 * and its guard, so this proves the modules agree with each other — the
 * per-module specs already prove each one alone.
 *
 * Runs against `DATABASE_URL`. Everything is created here and removed
 * afterwards, except what the database refuses to forget: audit rows and
 * privacy-notice evidence are append-only, so the patient is retired rather
 * than deleted, and the notice version is dated 2001 so it displaces
 * nothing on a database that already has one.
 */
describe('Billing patient journey (end to end)', () => {
  const RUN_SUFFIX = Date.now().toString(36).toUpperCase();
  const TEST_MARKER = `e2e-journey-${RUN_SUFFIX}`;
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const STAFF_USER_ID = 'c26e0c6e-7d7c-4b6a-9c1e-2f3a4b5c6d80';
  const STAFF_ROLE_CODE = 'E2E_JOURNEY_STAFF';
  const NOTICE_VERSION_CODE = 'e2e-journey-notice';
  const PROCEDURE_CODE = `E2E${RUN_SUFFIX}`;
  const CONSULTATION_PRICE = 150_000;
  const PROCEDURE_PRICE = 75_000;
  const MEDICATION_UNIT_PRICE = 5_000;
  const PRESCRIBED_QUANTITY = 10;
  const EXPECTED_TOTAL =
    CONSULTATION_PRICE + PROCEDURE_PRICE + MEDICATION_UNIT_PRICE * PRESCRIBED_QUANTITY;

  const PERMISSIONS = [
    ['patient.read:any', 'Patient', 'read'],
    ['patient.create:any', 'Patient', 'create'],
    ['registration.create:any', 'Registration', 'create'],
    ['registration.read:any', 'Registration', 'read'],
    ['registration.update:any', 'Registration', 'update'],
    ['encounter.read:any', 'Encounter', 'read'],
    ['encounter.write:any', 'Encounter', 'write'],
    ['medication.create:any', 'Medication', 'create'],
    ['medication.read:any', 'Medication', 'read'],
    ['inventory.write:any', 'Inventory', 'write'],
    ['prescription.write:any', 'Prescription', 'write'],
    ['dispense.write:any', 'DispenseRecord', 'write'],
    ['service-tariff.write:any', 'ServiceTariff', 'write'],
    ['invoice.read:any', 'Invoice', 'read'],
    ['invoice.write:any', 'Invoice', 'write'],
    ['payment.write:any', 'Payment', 'write'],
  ] as const;

  let app: INestApplication;
  let prisma: PrismaService;
  let staffToken: string;
  let specialtyId: string;
  let doctorId: string;
  let noticeVersionId: string;
  let consultationTariffId: string;
  let procedureTariffId: string;
  let medicationId: string;
  let patientId: string;
  let registrationId: string;
  let encounterId: string;
  let prescriptionId: string;
  let invoiceId: string;

  function asStaff(method: 'get' | 'post' | 'patch', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${staffToken}`);
  }

  async function seedActor(): Promise<void> {
    await prisma.user.upsert({
      where: { id: STAFF_USER_ID },
      update: { isActive: true, deletedAt: null },
      create: {
        id: STAFF_USER_ID,
        email: `${TEST_MARKER}-staff@example.test`,
        passwordHash: 'not-a-hash',
        isActive: true,
      },
    });
    for (const [permissionKey, resource, action] of PERMISSIONS) {
      await prisma.permission.upsert({
        where: { permissionKey },
        update: {},
        create: { permissionKey, resource, action, scope: PermissionScope.ANY },
      });
    }
    const permissions = await prisma.permission.findMany({
      where: { permissionKey: { in: PERMISSIONS.map(([permissionKey]) => permissionKey) } },
      select: { id: true },
    });
    const role = await prisma.role.upsert({
      where: { code: STAFF_ROLE_CODE },
      update: { deletedAt: null },
      create: { code: STAFF_ROLE_CODE, name: 'E2E journey staff', isSystem: false },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: STAFF_USER_ID, roleId: role.id } },
      update: { deletedAt: null, unassignedAt: null },
      create: { userId: STAFF_USER_ID, roleId: role.id },
    });
  }

  async function seedClinic(): Promise<void> {
    const specialty = await prisma.specialty.create({
      data: { name: `${TEST_MARKER} Poli Umum` },
      select: { id: true },
    });
    specialtyId = specialty.id;
    const doctor = await prisma.doctorProfile.create({
      data: { licenseNumber: `${TEST_MARKER}-str`, fullName: 'dr. Perjalanan', specialtyId },
      select: { id: true },
    });
    doctorId = doctor.id;
    // Dated far in the past so it is the current notice only on a database
    // with no real one — which is what CI has — and never displaces a real
    // one. Upserted because the table cannot be deleted from.
    await prisma.privacyNoticeVersion.upsert({
      where: { version: NOTICE_VERSION_CODE },
      update: {},
      create: {
        version: NOTICE_VERSION_CODE,
        effectiveAt: new Date('2001-01-02T00:00:00.000Z'),
        contentId: 'uji',
        contentEn: 'test',
        contentHashId: `${NOTICE_VERSION_CODE}-id`,
        contentHashEn: `${NOTICE_VERSION_CODE}-en`,
      },
    });
  }

  async function removeFixtures(): Promise<void> {
    const patients = await prisma.patientProfile.findMany({
      where: {
        fullName: { startsWith: 'Pasien Perjalanan' },
        address: { contains: 'e2e-journey' },
      },
      select: { id: true },
    });
    const patientIds = patients.map((patient) => patient.id);
    const invoices = await prisma.invoice.findMany({
      where: { patientId: { in: patientIds } },
      select: { id: true },
    });
    const invoiceIds = invoices.map((invoice) => invoice.id);
    await prisma.documentDelivery.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoiceDocument.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    const prescriptions = await prisma.prescription.findMany({
      where: { patientId: { in: patientIds } },
      select: { id: true },
    });
    const prescriptionIds = prescriptions.map((prescription) => prescription.id);
    await prisma.dispenseItemStockAllocation.deleteMany({
      where: { dispenseItem: { dispenseRecord: { prescriptionId: { in: prescriptionIds } } } },
    });
    await prisma.dispenseItem.deleteMany({
      where: { dispenseRecord: { prescriptionId: { in: prescriptionIds } } },
    });
    await prisma.dispenseRecord.deleteMany({ where: { prescriptionId: { in: prescriptionIds } } });
    await prisma.prescriptionMedication.deleteMany({
      where: { prescriptionId: { in: prescriptionIds } },
    });
    await prisma.prescription.deleteMany({ where: { id: { in: prescriptionIds } } });
    // By patient and by doctor: a run that died before its patient existed
    // still leaves a doctor nothing else references.
    const encounters = await prisma.encounter.findMany({
      where: {
        OR: [
          { patientId: { in: patientIds } },
          { doctor: { licenseNumber: { contains: 'e2e-journey' } } },
        ],
      },
      select: { id: true },
    });
    const encounterIds = encounters.map((encounter) => encounter.id);
    // Closing a visit queues it for SATUSEHAT and BPJS; those outbox rows
    // restrict the encounter and registration until they are gone.
    await prisma.satusehatSubmission.deleteMany({ where: { encounterId: { in: encounterIds } } });
    await prisma.bpjsReferral.deleteMany({ where: { encounterId: { in: encounterIds } } });
    await prisma.bpjsSubmission.deleteMany({
      where: { registration: { patientId: { in: patientIds } } },
    });
    await prisma.vitalSigns.deleteMany({ where: { encounterId: { in: encounterIds } } });
    await prisma.diagnosis.deleteMany({ where: { encounterId: { in: encounterIds } } });
    await prisma.procedure.deleteMany({ where: { encounterId: { in: encounterIds } } });
    await prisma.encounter.deleteMany({ where: { id: { in: encounterIds } } });
    await prisma.registration.deleteMany({ where: { patientId: { in: patientIds } } });
    // Privacy-notice evidence is immutable by trigger and references the
    // patient, so the record is retired rather than removed.
    await prisma.patientProfile.updateMany({
      where: { id: { in: patientIds } },
      data: { isActive: false, deletedAt: new Date() },
    });
    await prisma.medicationStockReceipt.deleteMany({
      where: { medication: { code: { startsWith: 'E2EJ' } } },
    });
    await prisma.medication.deleteMany({ where: { code: { startsWith: 'E2EJ' } } });
    await prisma.serviceTariff.deleteMany({ where: { code: { startsWith: 'E2EJ' } } });
    await prisma.doctorProfile.deleteMany({
      where: { licenseNumber: { contains: 'e2e-journey' } },
    });
    await prisma.specialty.deleteMany({ where: { name: { contains: 'e2e-journey' } } });
    const roles = await prisma.role.findMany({
      where: { code: STAFF_ROLE_CODE },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);
    await prisma.userRole.deleteMany({
      where: { OR: [{ roleId: { in: roleIds } }, { userId: STAFF_USER_ID }] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: STAFF_USER_ID } });
    // The privacy-notice evidence the front desk captured names this user as
    // the actor and is immutable, so the account is deactivated, never
    // deleted; the next run's upsert reactivates it.
    await prisma.user.updateMany({ where: { id: STAFF_USER_ID }, data: { isActive: false } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    await removeFixtures();
    await seedActor();
    await seedClinic();
    staffToken = await moduleRef
      .get(JwtService)
      .signAsync(
        { sub: STAFF_USER_ID, email: `${TEST_MARKER}-staff@example.test` },
        { secret: JWT_SECRET },
      );
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
    await prisma.$disconnect();
  });

  describe('the clinic prices its services', () => {
    it('creates a consultation tariff and a procedure tariff mapped to an ICD-9-CM code', async () => {
      const consultation = await asStaff('post', '/api/v1/service-tariffs').send({
        code: `E2EJ-KONSUL-${RUN_SUFFIX}`,
        name: 'Konsultasi dokter umum (e2e)',
        category: 'CONSULTATION',
        price: CONSULTATION_PRICE,
      });
      const procedure = await asStaff('post', '/api/v1/service-tariffs').send({
        code: `E2EJ-TINDAKAN-${RUN_SUFFIX}`,
        name: 'Injeksi intramuskular (e2e)',
        category: 'PROCEDURE',
        icd9cmCode: PROCEDURE_CODE,
        price: PROCEDURE_PRICE,
      });

      expect(consultation.status).toBe(201);
      expect(procedure.status).toBe(201);
      consultationTariffId = consultation.body.data.id;
      procedureTariffId = procedure.body.data.id;
      expect(procedureTariffId).toBeDefined();
    });

    it('stocks a medication the pharmacy can dispense', async () => {
      const medication = await asStaff('post', '/api/v1/medications').send({
        code: `E2EJ${RUN_SUFFIX}`,
        name: 'Paracetamol 500 mg (e2e)',
        reorderLevel: 5,
      });
      expect(medication.status).toBe(201);
      medicationId = medication.body.data.id;
      // The catalog API carries no selling price yet (the column is nullable
      // because the MVP catalog predates billing); the invoice line needs one.
      await prisma.medication.update({
        where: { id: medicationId },
        data: { unitPrice: MEDICATION_UNIT_PRICE },
      });

      const receipt = await asStaff('post', '/api/v1/inventory/receipts').send({
        medicationId,
        batchNumber: `B-${RUN_SUFFIX}`,
        expiryDate: '2030-12-31',
        quantity: 100,
      });

      expect(receipt.status).toBe(201);
    });
  });

  describe('the front desk registers the patient', () => {
    it('creates the patient record with the privacy notice acknowledged', async () => {
      const notice = await asStaff('get', '/api/v1/patients/privacy-notice/current');
      expect(notice.status).toBe(200);
      noticeVersionId = notice.body.data.id;

      const response = await asStaff('post', '/api/v1/patients').send({
        fullName: 'Pasien Perjalanan E2E',
        dateOfBirth: '1990-05-17',
        sex: 'FEMALE',
        phoneNumber: '0812-0000-1990',
        address: `Jl. Uji ${TEST_MARKER}`,
        privacyNotice: {
          privacyNoticeVersionId: noticeVersionId,
          locale: 'id',
          outcome: 'ACKNOWLEDGED',
          subjectType: 'SELF',
          provenance: 'FRONT_DESK',
        },
      });

      expect(response.status).toBe(201);
      const patient = response.body.data.patient ?? response.body.data;
      patientId = patient.id;
      expect(patient.mrn).toEqual(expect.any(String));
    });

    it('puts the patient in today’s queue and checks them in', async () => {
      const registered = await asStaff('post', '/api/v1/registrations').send({ patientId });
      expect(registered.status).toBe(201);
      expect(registered.body.data.status).toBe('PENDING');
      expect(registered.body.data.queueNumber).toBeGreaterThan(0);
      registrationId = registered.body.data.id;

      const checkedIn = await asStaff('patch', `/api/v1/registrations/${registrationId}`).send({
        status: 'CHECKED_IN',
      });

      expect(checkedIn.status).toBe(200);
      expect(checkedIn.body.data.status).toBe('CHECKED_IN');
    });
  });

  describe('the doctor sees the patient', () => {
    it('opens the encounter from the checked-in registration', async () => {
      const response = await asStaff('post', '/api/v1/encounters').send({
        registrationId,
        doctorId,
      });

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('IN_PROGRESS');
      encounterId = response.body.data.id;
    });

    it('records vitals, a primary diagnosis and a priced procedure', async () => {
      const vitals = await asStaff('post', `/api/v1/encounters/${encounterId}/vital-signs`).send({
        heightCm: 165,
        weightKg: 58,
        systolicBloodPressure: 118,
        diastolicBloodPressure: 76,
        temperatureCelsius: 37.8,
      });
      const diagnosis = await asStaff('post', `/api/v1/encounters/${encounterId}/diagnoses`).send({
        code: 'J06.9',
        display: 'Acute upper respiratory infection, unspecified',
        type: 'PRIMARY',
      });
      const procedure = await asStaff('post', `/api/v1/encounters/${encounterId}/procedures`).send({
        code: PROCEDURE_CODE,
        display: 'Injeksi intramuskular',
      });

      expect(vitals.status).toBe(201);
      expect(diagnosis.status).toBe(201);
      expect(procedure.status).toBe(201);
    });

    it('writes the prescription against the open encounter', async () => {
      const response = await asStaff('post', '/api/v1/prescriptions').send({
        patientId,
        doctorId,
        encounterId,
        items: [
          {
            medicationId,
            dosage: '500 mg',
            frequency: '3x sehari',
            durationDays: 3,
            quantity: PRESCRIBED_QUANTITY,
            instructions: 'Sesudah makan',
          },
        ],
      });

      expect(response.status).toBe(201);
      prescriptionId = response.body.data.id;
      expect(response.body.data.items).toHaveLength(1);
    });

    it('refuses to bill a visit that is still in progress', async () => {
      const response = await asStaff('post', '/api/v1/invoices').send({ encounterId });

      expect(response.status).toBe(409);
    });

    it('closes the visit, which completes the registration', async () => {
      const closed = await asStaff('post', `/api/v1/encounters/${encounterId}/close`);
      const registration = await asStaff('get', `/api/v1/registrations/${registrationId}`);

      expect(closed.status).toBe(200);
      expect(closed.body.data).toEqual(
        expect.objectContaining({
          status: 'FINISHED',
          vitalSignsCount: 1,
          diagnosisCount: 1,
          procedureCount: 1,
        }),
      );
      expect(registration.body.data.status).toBe('COMPLETED');
    });
  });

  describe('the pharmacist dispenses', () => {
    it('hands over the prescribed quantity and settles the prescription', async () => {
      const response = await asStaff('post', '/api/v1/dispenses').send({
        prescriptionId,
        items: [{ medicationId, quantity: PRESCRIBED_QUANTITY }],
      });

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual(
        expect.objectContaining({ status: 'DISPENSED', prescriptionStatus: 'DISPENSED' }),
      );
    });
  });

  describe('the cashier bills and settles', () => {
    it('generates the invoice from the finished visit with consultation, procedure and medicine', async () => {
      const response = await asStaff('post', '/api/v1/invoices').send({
        encounterId,
        consultationTariffId,
      });

      expect(response.status).toBe(201);
      expect(response.body.meta.gaps).toEqual([]);
      const invoice = response.body.data;
      invoiceId = invoice.id;
      expect(invoice.status).toBe('DRAFT');
      expect(invoice.totalAmount).toBe(EXPECTED_TOTAL);
      expect(invoice.items).toHaveLength(3);
      expect(invoice.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            itemType: 'CONSULTATION',
            serviceTariffId: consultationTariffId,
            amount: CONSULTATION_PRICE,
          }),
          expect.objectContaining({
            itemType: 'PROCEDURE',
            serviceTariffId: procedureTariffId,
            quantity: 1,
            amount: PROCEDURE_PRICE,
          }),
          expect.objectContaining({
            itemType: 'MEDICATION',
            medicationId,
            quantity: PRESCRIBED_QUANTITY,
            unitPrice: MEDICATION_UNIT_PRICE,
            amount: MEDICATION_UNIT_PRICE * PRESCRIBED_QUANTITY,
          }),
        ]),
      );
    });

    it('will not generate a second live invoice for the same visit', async () => {
      const response = await asStaff('post', '/api/v1/invoices').send({
        encounterId,
        consultationTariffId,
      });

      expect(response.status).toBe(409);
    });

    it('issues the invoice and pins a document snapshot for the PDF', async () => {
      const response = await asStaff('post', `/api/v1/invoices/${invoiceId}/issue`);
      const snapshot = await prisma.invoiceDocument.findFirst({
        where: { invoiceId, hasVoidWatermark: false },
        select: { status: true, renderedData: true },
      });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('ISSUED');
      expect(response.body.data.issuedAt).toEqual(expect.any(String));
      expect(snapshot).not.toBeNull();
      expect(snapshot?.status).toBe('PENDING');
    });

    it('refuses a payment that does not match the total', async () => {
      const response = await asStaff('post', `/api/v1/invoices/${invoiceId}/payment`).send({
        method: 'CASH',
        amount: EXPECTED_TOTAL - 1_000,
      });

      expect(response.status).toBe(400);
    });

    it('takes the cash and marks the invoice paid', async () => {
      const response = await asStaff('post', `/api/v1/invoices/${invoiceId}/payment`).send({
        method: 'CASH',
        amount: EXPECTED_TOTAL,
        notes: 'Lunas di kasir (e2e)',
      });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('PAID');
      expect(response.body.data.payment).toEqual(
        expect.objectContaining({
          method: 'CASH',
          amount: EXPECTED_TOTAL,
          cashierId: STAFF_USER_ID,
        }),
      );
    });

    it('shows the settlement on the day’s cashier report', async () => {
      const response = await asStaff('get', '/api/v1/reports/cashier-daily');

      expect(response.status).toBe(200);
      expect(response.body.data.totals.count).toBeGreaterThanOrEqual(1);
      expect(response.body.data.totals.totalAmount).toBeGreaterThanOrEqual(EXPECTED_TOTAL);
      expect(response.body.data.byMethod).toEqual(
        expect.arrayContaining([expect.objectContaining({ method: 'CASH' })]),
      );
    });

    it('reads back as a paid invoice for this patient and visit', async () => {
      const response = await asStaff('get', `/api/v1/invoices/${invoiceId}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(
        expect.objectContaining({
          status: 'PAID',
          patientId,
          encounterId,
          totalAmount: EXPECTED_TOTAL,
        }),
      );
    });
  });
});
