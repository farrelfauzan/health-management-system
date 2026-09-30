import { randomUUID } from 'node:crypto';

import { getCalendarDateInTimeZone } from '@hms/shared-types';
import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';

const PHARMACY_PATH = '/api/v1/v1/analytics/pharmacy';
const FINANCE_PATH = '/api/v1/v1/analytics/finance';
const EXPIRY_REPORT_PATH = '/api/v1/v1/inventory/expiry-report';
const DAY = '2031-11-12';
const ISSUED_AT = new Date(`${DAY}T09:00:00+07:00`);
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const ADMIN_PERMISSIONS = [
  { action: 'read-pharmacy', resource: 'Analytics', scope: 'ANY' as const },
  { action: 'read-finance', resource: 'Analytics', scope: 'ANY' as const },
  { action: 'read', resource: 'Inventory', scope: 'ANY' as const },
];

type SeededPrescription = {
  status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_DISPENSED' | 'DISPENSED' | 'CANCELLED';
  fulfilmentSite?: 'INTERNAL' | 'EXTERNAL';
  dispensedAfterMinutes?: number;
};

type PharmacyTotals = Record<string, number | null>;

type ReorderRow = { medicationId: string; stock: number; reorderLevel: number };

/**
 * P29-T13 against a real PostgreSQL. Ten prescriptions issued on 12 November
 * 2031 under a poli made for this spec (six dispensed, one partly, one
 * cancelled, one waiting, one sent to an outside apotek) plus a draft that
 * never counts. Stock is now: an amoxicillin with 40 left against a reorder
 * level of 50, and an expired batch beside it that must not hide the
 * shortage.
 */
describe('Analytics pharmacy against PostgreSQL', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const specialtyId = randomUUID();
  const doctorId = randomUUID();
  const patientId = randomUUID();
  const amoxicillinId = randomUUID();
  const paracetamolId = randomUUID();
  const registrationIds: string[] = [];
  const encounterIds: string[] = [];
  const prescriptionIds: string[] = [];
  const invoiceIds: string[] = [];
  let pharmacistId = '';

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const featureAvailabilityCacheMock = {
    isEnabled: jest.fn<Promise<boolean>, [string]>(async () => true),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  function mockActor(roleCode: string, permissions: typeof ADMIN_PERMISSIONS): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'analytics-user',
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

  async function signToken(): Promise<string> {
    return jwtService.signAsync(
      { sub: 'analytics-user', email: 'analytics@hms.local' },
      { secret: 'dev-access-secret' },
    );
  }

  async function readDashboard(
    path: string,
    query: Record<string, string> = {},
  ): Promise<request.Response> {
    return request(app.getHttpServer())
      .get(path)
      .query({ from: DAY, to: DAY, specialtyId, ...query })
      .set('Authorization', `Bearer ${await signToken()}`);
  }

  function shiftClinicToday(days: number): Date {
    const today = getCalendarDateInTimeZone(new Date(), 'Asia/Jakarta');
    return new Date(new Date(`${today}T00:00:00Z`).getTime() + days * DAY_MS);
  }

  async function seedVisit(queueNumber: number): Promise<string> {
    const registration = await prisma.registration.create({
      data: {
        patientId,
        specialtyId,
        poliQueueNumber: queueNumber,
        status: 'COMPLETED',
        payerType: 'BPJS',
        registeredAt: ISSUED_AT,
        checkedInAt: ISSUED_AT,
      },
    });
    registrationIds.push(registration.id);
    const encounter = await prisma.encounter.create({
      data: {
        registrationId: registration.id,
        patientId,
        doctorId,
        status: 'FINISHED',
        startedAt: ISSUED_AT,
      },
    });
    encounterIds.push(encounter.id);
    return encounter.id;
  }

  async function seedMedications(): Promise<void> {
    await prisma.medication.createMany({
      data: [
        {
          id: amoxicillinId,
          code: `AMX-${suffix}`,
          name: `Amoksisilin ${suffix}`,
          reorderLevel: 50,
        },
        {
          id: paracetamolId,
          code: `PCT-${suffix}`,
          name: `Parasetamol ${suffix}`,
          reorderLevel: 0,
        },
      ],
    });
    await prisma.medicationStockReceipt.createMany({
      data: [
        {
          medicationId: amoxicillinId,
          batchNumber: `A1-${suffix}`,
          expiryDate: new Date('2099-12-31T00:00:00Z'),
          quantity: 100,
          remainingQuantity: 40,
        },
        {
          medicationId: amoxicillinId,
          batchNumber: `A2-${suffix}`,
          expiryDate: shiftClinicToday(-1),
          quantity: 30,
          remainingQuantity: 30,
        },
        {
          medicationId: paracetamolId,
          batchNumber: `P1-${suffix}`,
          expiryDate: shiftClinicToday(10),
          quantity: 20,
          remainingQuantity: 20,
        },
        {
          medicationId: paracetamolId,
          batchNumber: `P2-${suffix}`,
          expiryDate: shiftClinicToday(45),
          quantity: 15,
          remainingQuantity: 15,
        },
      ],
    });
  }

  async function seedPrescription(
    encounterId: string,
    { status, fulfilmentSite = 'INTERNAL', dispensedAfterMinutes }: SeededPrescription,
  ): Promise<void> {
    const prescription = await prisma.prescription.create({
      data: {
        patientId,
        doctorId,
        encounterId,
        status,
        fulfilmentSite,
        externalFacilityName: fulfilmentSite === 'EXTERNAL' ? 'Apotek Uji' : null,
        issuedAt: status === 'DRAFT' ? null : ISSUED_AT,
      },
    });
    prescriptionIds.push(prescription.id);
    if (dispensedAfterMinutes === undefined) {
      return;
    }
    // A reversed dispense before the real one: neither its time nor its units count.
    await prisma.dispenseRecord.create({
      data: {
        prescriptionId: prescription.id,
        pharmacistId,
        status: 'CANCELLED',
        dispensedAt: new Date(ISSUED_AT.getTime() + MINUTE_MS),
        items: { create: [{ medicationId: paracetamolId, quantity: 100 }] },
      },
    });
    await prisma.dispenseRecord.create({
      data: {
        prescriptionId: prescription.id,
        pharmacistId,
        status: 'DISPENSED',
        dispensedAt: new Date(ISSUED_AT.getTime() + dispensedAfterMinutes * MINUTE_MS),
        items: {
          create: [
            { medicationId: paracetamolId, quantity: 10 },
            { medicationId: amoxicillinId, quantity: 5 },
          ],
        },
      },
    });
  }

  async function seedInvoice(
    encounterId: string,
    status: 'DRAFT' | 'ISSUED',
    medicationAmount: number,
  ): Promise<void> {
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${suffix}-${status}`,
        encounterId,
        patientId,
        status,
        totalAmount: medicationAmount + 100_000,
        taxAmount: 0,
        issuedAt: status === 'DRAFT' ? null : ISSUED_AT,
        items: {
          create: [
            {
              itemType: 'MEDICATION',
              description: 'Obat',
              quantity: 1,
              unitPrice: medicationAmount,
              amount: medicationAmount,
              taxAmount: 0,
            },
            {
              itemType: 'CONSULTATION',
              description: 'Konsultasi',
              quantity: 1,
              unitPrice: 100_000,
              amount: 100_000,
              taxAmount: 0,
            },
          ],
        },
      },
    });
    invoiceIds.push(invoice.id);
  }

  async function seedClinic(): Promise<void> {
    const pharmacist = await prisma.user.create({
      data: {
        email: `${suffix}@example.test`,
        passwordHash: 'not-a-real-hash',
        fullName: 'Apoteker',
      },
      select: { id: true },
    });
    pharmacistId = pharmacist.id;
    await prisma.specialty.create({ data: { id: specialtyId, name: `Poli ${suffix}` } });
    await prisma.doctorProfile.create({
      data: { id: doctorId, licenseNumber: `LIC-${suffix}`, fullName: 'dr. Resep', specialtyId },
    });
    await prisma.patientProfile.create({
      data: {
        id: patientId,
        mrn: `MRN-${suffix}`,
        fullName: 'Patient Resep',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '0800000000',
        address: 'Jl. Uji',
      },
    });
    await seedMedications();
    const encounterId = await seedVisit(1);
    const draftEncounterId = await seedVisit(2);
    const prescriptions: SeededPrescription[] = [
      ...[10, 12, 14, 16, 18, 20].map((minutes) => ({
        status: 'DISPENSED' as const,
        dispensedAfterMinutes: minutes,
      })),
      { status: 'PARTIALLY_DISPENSED', dispensedAfterMinutes: 30 },
      { status: 'CANCELLED' },
      { status: 'ISSUED' },
      { status: 'ISSUED', fulfilmentSite: 'EXTERNAL' },
      { status: 'DRAFT' },
    ];
    for (const prescription of prescriptions) {
      await seedPrescription(encounterId, prescription);
    }
    await seedInvoice(encounterId, 'ISSUED', 150_000);
    await seedInvoice(draftEncounterId, 'DRAFT', 999_000);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(FeatureAvailabilityCacheService)
      .useValue(featureAvailabilityCacheMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    jwtService = moduleRef.get(JwtService);
    prisma = moduleRef.get(PrismaService);
    await seedClinic();
  });

  beforeEach(() => {
    mockActor('ADMIN', ADMIN_PERMISSIONS);
    featureAvailabilityCacheMock.isEnabled.mockImplementation(async () => true);
  });

  afterAll(async () => {
    await prisma.dispenseRecord.deleteMany({ where: { prescriptionId: { in: prescriptionIds } } });
    await prisma.prescription.deleteMany({ where: { id: { in: prescriptionIds } } });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.encounter.deleteMany({ where: { id: { in: encounterIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.medicationStockReceipt.deleteMany({
      where: { medicationId: { in: [amoxicillinId, paracetamolId] } },
    });
    await prisma.medication.deleteMany({ where: { id: { in: [amoxicillinId, paracetamolId] } } });
    await prisma.patientProfile.deleteMany({ where: { id: patientId } });
    await prisma.doctorProfile.deleteMany({ where: { id: doctorId } });
    await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    await prisma.user.deleteMany({ where: { id: pharmacistId } });
    await app.close();
  });

  it('counts the period by outcome, leaves the outside apotek out of the rate, and times the first real dispense', async () => {
    const response = await readDashboard(PHARMACY_PATH);

    expect(response.status).toBe(200);
    expect(response.body.data.totals as PharmacyTotals).toMatchObject({
      prescriptionsIssued: 10,
      fullyDispensed: 6,
      partiallyDispensed: 1,
      cancelled: 1,
      awaitingDispense: 1,
      filledElsewhere: 1,
      fullyDispensedPercent: 66.7,
      // 10, 12, 14, 16, 18, 20 and 30 minutes; the reversed dispense at 1 does not count.
      medianDispenseMinutes: 16,
    });
  });

  it('ranks medications by units on dispenses that were not reversed', async () => {
    const response = await readDashboard(PHARMACY_PATH);

    expect(response.body.data.breakdowns.topMedications).toEqual([
      expect.objectContaining({ medicationId: paracetamolId, quantity: 70, dispenses: 7 }),
      expect.objectContaining({ medicationId: amoxicillinId, quantity: 35, dispenses: 7 }),
    ]);
  });

  it('shows the same medication revenue as the finance dashboard, drafts left out', async () => {
    const pharmacy = await readDashboard(PHARMACY_PATH);
    const finance = await readDashboard(FINANCE_PATH);
    const medicationLine = (
      finance.body.data.breakdowns.itemTypes as Array<{ itemType: string; amount: number }>
    ).find((row) => row.itemType === 'MEDICATION');

    expect(pharmacy.body.data.totals.medicationRevenue).toBe(150_000);
    expect(medicationLine?.amount).toBe(150_000);
  });

  it('given amoxicillin with 40 left and reorder level 50, then it is listed under reorder', async () => {
    const response = await readDashboard(PHARMACY_PATH);
    const reorder = response.body.data.breakdowns.stock.reorder as ReorderRow[];

    // The expired batch of 30 is on the shelf but is not stock.
    expect(reorder.find((row) => row.medicationId === amoxicillinId)).toMatchObject({
      stock: 40,
      reorderLevel: 50,
    });
    expect(reorder.some((row) => row.medicationId === paracetamolId)).toBe(false);
  });

  it('counts the same expired and expiring batches as the expiry report', async () => {
    const pharmacy = await readDashboard(PHARMACY_PATH, { payerType: 'BPJS' });
    const report = await request(app.getHttpServer())
      .get(EXPIRY_REPORT_PATH)
      .query({ days: 30 })
      .set('Authorization', `Bearer ${await signToken()}`);
    const items = report.body.data.items as Array<{ expiryStatus: string }>;
    const windows = pharmacy.body.data.breakdowns.stock.expiring as Array<{
      window: string;
      batches: number;
    }>;

    expect(report.status).toBe(200);
    expect(windows.find((row) => row.window === 'EXPIRED')?.batches).toBe(
      items.filter((item) => item.expiryStatus === 'EXPIRED').length,
    );
    expect(windows.find((row) => row.window === 'WITHIN_30_DAYS')?.batches).toBe(
      items.filter((item) => item.expiryStatus === 'EXPIRING').length,
    );
    expect(windows.find((row) => row.window === 'WITHIN_60_DAYS')?.batches).toBeGreaterThan(0);
  });

  it('narrows prescriptions by prescriber and payer but never narrows stock', async () => {
    const byDoctor = await readDashboard(PHARMACY_PATH, { doctorId: randomUUID() });
    const byPayer = await readDashboard(PHARMACY_PATH, { payerType: 'INSURANCE' });

    expect(byDoctor.body.data.totals.prescriptionsIssued).toBe(0);
    expect(byPayer.body.data.totals.prescriptionsIssued).toBe(0);
    expect(byPayer.body.data.totals.medicationRevenue).toBe(0);
    expect(
      (byDoctor.body.data.breakdowns.stock.reorder as ReorderRow[]).some(
        (row) => row.medicationId === amoxicillinId,
      ),
    ).toBe(true);
  });

  it('given a pharmacist, then pharmacy analytics opens and finance analytics does not', async () => {
    mockActor('PHARMACIST', [ADMIN_PERMISSIONS[0] as (typeof ADMIN_PERMISSIONS)[number]]);

    const pharmacy = await readDashboard(PHARMACY_PATH, { doctorId: doctorId });
    const finance = await readDashboard(FINANCE_PATH, { doctorId: doctorId });

    expect(pharmacy.status).toBe(200);
    expect(finance.status).toBe(403);
  });

  it('refuses with FEATURE_DISABLED when the pharmacy module is off', async () => {
    featureAvailabilityCacheMock.isEnabled.mockImplementation(async (key) => key !== 'pharmacy');

    const response = await readDashboard(PHARMACY_PATH);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FEATURE_DISABLED');
  });

  it('carries no patient identifier and no prescription id', async () => {
    const response = await readDashboard(PHARMACY_PATH);
    const body = JSON.stringify(response.body);

    expect(body).not.toContain(patientId);
    expect(body).not.toContain(`MRN-${suffix}`);
    expect(prescriptionIds.some((id) => body.includes(id))).toBe(false);
  });
});
