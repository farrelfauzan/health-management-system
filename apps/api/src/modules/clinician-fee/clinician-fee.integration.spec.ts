import { getCalendarDateInTimeZone } from '@hms/shared-types';
import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionScope } from '../../generated/prisma/client';
import { ClinicianFeeLedgerService } from './service/clinician-fee-ledger.service';

/**
 * P27-T06 (SJ-247) against real Postgres, over the public routes.
 *
 * Given a 60% rule on consultation for dr. A and a paid Rp150,000
 * consultation, one entry with a gross fee of Rp90,000 is written for dr. A
 * in the payment month; reversing it writes −Rp90,000 in the void month; the
 * monthly statement sums both; and neither write can happen twice.
 *
 * The reversal is driven through the ledger service, not `POST …/void`: on
 * main a PAID invoice cannot be voided (`INVOICE_STATUS_TRANSITIONS`, refunds
 * are out of scope), which this spec also pins. The billing void route calls
 * the same method inside its transaction, so the day PAID → VOID is allowed
 * the reversal needs no further change.
 */
// Booting the whole AppModule against a real database can take longer than
// jest's 5 s default on a busy runner.
const SUITE_TIMEOUT_MS = 120_000;

jest.setTimeout(SUITE_TIMEOUT_MS);

describe('Clinician fee sharing (P27-T06)', () => {
  const RUN_SUFFIX = Date.now().toString(36).toUpperCase();
  const TEST_MARKER = `e2e-fee-${RUN_SUFFIX}`;
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const STAFF_USER_ID = 'd37f1d7f-8e8d-4c7b-ad2f-3a4b5c6d7e91';
  const STAFF_ROLE_CODE = 'E2E_FEE_STAFF';
  const CONSULTATION_PRICE = 150_000;
  // The payment is taken now, over HTTP, so its month is the clinic's current
  // one (the timezone boundary itself is pinned in the ledger unit spec). The
  // reversal is dated years ahead so its month can never be the payment's.
  const CLINIC_TIME_ZONE = process.env.CLINIC_TIMEZONE ?? 'Asia/Jakarta';
  const PERIOD_LENGTH = 7;
  const PAYMENT_PERIOD = getCalendarDateInTimeZone(new Date(), CLINIC_TIME_ZONE).slice(
    0,
    PERIOD_LENGTH,
  );
  const VOIDED_AT = new Date('2031-01-15T02:00:00.000Z');
  const VOID_PERIOD = '2031-01';

  const PERMISSIONS = [
    ['invoice.read:any', 'Invoice', 'read'],
    ['invoice.write:any', 'Invoice', 'write'],
    ['payment.write:any', 'Payment', 'write'],
    ['clinician-fee.read:any', 'ClinicianFee', 'read'],
    ['clinician-fee.write:any', 'ClinicianFee', 'write'],
  ] as const;

  let app: INestApplication;
  let prisma: PrismaService;
  let ledgerService: ClinicianFeeLedgerService;
  let staffToken: string;
  let specialtyId: string;
  let doctorAId: string;
  let doctorBId: string;
  let tariffId: string;
  let patientId: string;
  let invoiceId: string;
  let invoiceItemId: string;
  let ruleId: string;

  function asStaff(method: 'get' | 'post' | 'patch' | 'delete', path: string) {
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
      create: { code: STAFF_ROLE_CODE, name: 'E2E fee staff', isSystem: false },
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

  /** One finished visit by dr. A, billed as an ISSUED Rp150,000 consultation. */
  async function seedIssuedInvoice(): Promise<void> {
    const specialty = await prisma.specialty.create({
      data: { name: `${TEST_MARKER} Poli` },
      select: { id: true },
    });
    specialtyId = specialty.id;
    const [doctorA, doctorB] = await Promise.all([
      prisma.doctorProfile.create({
        data: { licenseNumber: `${TEST_MARKER}-a`, fullName: 'dr. A Jasa', specialtyId },
        select: { id: true },
      }),
      prisma.doctorProfile.create({
        data: { licenseNumber: `${TEST_MARKER}-b`, fullName: 'dr. B Jasa', specialtyId },
        select: { id: true },
      }),
    ]);
    doctorAId = doctorA.id;
    doctorBId = doctorB.id;
    const tariff = await prisma.serviceTariff.create({
      data: {
        code: `E2EF-${RUN_SUFFIX}`,
        name: 'Konsultasi (e2e fee)',
        category: 'CONSULTATION',
        specialtyId,
        price: CONSULTATION_PRICE,
      },
      select: { id: true },
    });
    tariffId = tariff.id;
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `E2EF-${RUN_SUFFIX}`,
        fullName: 'Pasien Jasa Medis',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '+6281200000000',
        address: TEST_MARKER,
      },
      select: { id: true },
    });
    patientId = patient.id;
    const registration = await prisma.registration.create({
      data: { patientId, status: 'COMPLETED' },
      select: { id: true },
    });
    const encounter = await prisma.encounter.create({
      data: {
        registrationId: registration.id,
        patientId,
        doctorId: doctorAId,
        status: 'FINISHED',
      },
      select: { id: true },
    });
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV/E2EF/${RUN_SUFFIX}`,
        encounterId: encounter.id,
        patientId,
        status: 'ISSUED',
        totalAmount: CONSULTATION_PRICE,
        issuedAt: new Date(),
        items: {
          create: {
            itemType: 'CONSULTATION',
            serviceTariffId: tariffId,
            description: 'Konsultasi (e2e fee)',
            quantity: 1,
            unitPrice: CONSULTATION_PRICE,
            amount: CONSULTATION_PRICE,
          },
        },
      },
      select: { id: true, items: { select: { id: true } } },
    });
    invoiceId = invoice.id;
    invoiceItemId = invoice.items[0]?.id ?? '';
  }

  async function removeFixtures(): Promise<void> {
    const patients = await prisma.patientProfile.findMany({
      where: { address: { startsWith: 'e2e-fee-' } },
      select: { id: true },
    });
    const patientIds = patients.map((patient) => patient.id);
    const invoices = await prisma.invoice.findMany({
      where: { patientId: { in: patientIds } },
      select: { id: true },
    });
    const invoiceIds = invoices.map((invoice) => invoice.id);
    const doctors = await prisma.doctorProfile.findMany({
      where: { licenseNumber: { startsWith: 'e2e-fee-' } },
      select: { id: true },
    });
    const doctorIds = doctors.map((doctor) => doctor.id);
    await prisma.clinicianFeeEntry.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.clinicianFeeRule.deleteMany({ where: { doctorId: { in: doctorIds } } });
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    // Recording a payment cuts the paid-receipt document row.
    await prisma.invoiceDocument.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.encounter.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.registration.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.serviceTariff.deleteMany({ where: { code: { startsWith: 'E2EF-' } } });
    await prisma.doctorProfile.deleteMany({ where: { id: { in: doctorIds } } });
    await prisma.specialty.deleteMany({ where: { name: { startsWith: 'e2e-fee-' } } });
    await prisma.userRole.deleteMany({ where: { userId: STAFF_USER_ID } });
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
    ledgerService = moduleRef.get(ClinicianFeeLedgerService);
    await removeFixtures();
    await seedActor();
    await seedIssuedInvoice();
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

  describe('rules', () => {
    it('creates a 60% consultation rule for dr. A', async () => {
      const response = await asStaff('post', '/api/v1/clinician-fee-rules').send({
        category: 'CONSULTATION',
        doctorId: doctorAId,
        mode: 'PERCENT',
        value: 60,
        effectiveFrom: '2020-01-01',
      });

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual(
        expect.objectContaining({
          level: 'CLINICIAN_CATEGORY',
          doctorName: 'dr. A Jasa',
          mode: 'PERCENT',
          value: 60,
          effectiveFrom: '2020-01-01',
        }),
      );
      ruleId = response.body.data.id;
    });

    it('refuses an overlapping rule for the same target and clinician', async () => {
      const response = await asStaff('post', '/api/v1/clinician-fee-rules').send({
        category: 'CONSULTATION',
        doctorId: doctorAId,
        mode: 'FIXED',
        value: 50_000,
        effectiveFrom: '2026-12-01',
      });

      expect(response.status).toBe(409);
      expect(JSON.stringify(response.body)).toContain('CLINICIAN_FEE_RULE_OVERLAP');
    });

    it('refuses a percentage above 100 and a rule with two targets', async () => {
      const tooHigh = await asStaff('post', '/api/v1/clinician-fee-rules').send({
        category: 'PROCEDURE',
        mode: 'PERCENT',
        value: 101,
        effectiveFrom: '2020-01-01',
      });
      const twoTargets = await asStaff('post', '/api/v1/clinician-fee-rules').send({
        category: 'PROCEDURE',
        serviceTariffId: tariffId,
        mode: 'PERCENT',
        value: 10,
        effectiveFrom: '2020-01-01',
      });

      expect(tooHigh.status).toBe(400);
      expect(twoTargets.status).toBe(400);
    });

    it('lists the rule with its level', async () => {
      const response = await asStaff('get', '/api/v1/clinician-fee-rules');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: ruleId })]),
      );
    });
  });

  describe('pay → accrual', () => {
    it('writes one Rp90,000 entry for dr. A in the payment month', async () => {
      const response = await asStaff('post', `/api/v1/invoices/${invoiceId}/payment`).send({
        method: 'CASH',
        amount: CONSULTATION_PRICE,
      });

      expect(response.status).toBe(200);
      const actualEntries = await prisma.clinicianFeeEntry.findMany({ where: { invoiceId } });
      expect(actualEntries).toHaveLength(1);
      expect(actualEntries[0]).toEqual(
        expect.objectContaining({
          kind: 'ACCRUAL',
          doctorId: doctorAId,
          invoiceItemId,
          ruleId,
          period: PAYMENT_PERIOD,
        }),
      );
      expect(Number(actualEntries[0]?.lineAmount)).toBe(150_000);
      expect(Number(actualEntries[0]?.grossFee)).toBe(90_000);
      expect(Number(actualEntries[0]?.clinicShare)).toBe(60_000);
    });

    it('does not write the accrual twice', async () => {
      const actualInserted = await prisma.executeTransaction((tx) =>
        ledgerService.recordAccrualsForPaidInvoice(tx, { invoiceId, paidAt: new Date() }),
      );
      const secondPayment = await asStaff('post', `/api/v1/invoices/${invoiceId}/payment`).send({
        method: 'CASH',
        amount: CONSULTATION_PRICE,
      });

      expect(actualInserted).toBe(0);
      expect(secondPayment.status).toBe(409);
      expect(await prisma.clinicianFeeEntry.count({ where: { invoiceId } })).toBe(1);
    });
  });

  describe('void → reversal', () => {
    it('still refuses to void a PAID invoice over HTTP (refunds are out of scope on main)', async () => {
      const response = await asStaff('post', `/api/v1/invoices/${invoiceId}/void`).send({
        reason: 'Salah pasien',
      });

      expect(response.status).toBe(409);
      expect(await prisma.clinicianFeeEntry.count({ where: { invoiceId } })).toBe(1);
    });

    it('writes −Rp90,000 in the void month, once', async () => {
      const actualFirst = await prisma.executeTransaction((tx) =>
        ledgerService.recordReversalsForVoidedInvoice(tx, { invoiceId, voidedAt: VOIDED_AT }),
      );
      const actualSecond = await prisma.executeTransaction((tx) =>
        ledgerService.recordReversalsForVoidedInvoice(tx, { invoiceId, voidedAt: VOIDED_AT }),
      );

      expect(actualFirst).toBe(1);
      expect(actualSecond).toBe(0);
      const reversal = await prisma.clinicianFeeEntry.findFirstOrThrow({
        where: { invoiceId, kind: 'REVERSAL' },
      });
      expect(reversal.period).toBe(VOID_PERIOD);
      expect(Number(reversal.grossFee)).toBe(-90_000);
      expect(Number(reversal.clinicShare)).toBe(-60_000);
      expect(Number(reversal.lineAmount)).toBe(-150_000);
    });
  });

  describe('statements', () => {
    it("totals dr. A's payment month and void month separately", async () => {
      const paymentMonth = await asStaff(
        'get',
        `/api/v1/clinician-fees/statements/${doctorAId}?period=${PAYMENT_PERIOD}`,
      );
      const voidMonth = await asStaff(
        'get',
        `/api/v1/clinician-fees/statements/${doctorAId}?period=${VOID_PERIOD}`,
      );

      expect(paymentMonth.status).toBe(200);
      expect(paymentMonth.body.data.totals).toEqual({
        entryCount: 1,
        lineAmount: 150_000,
        grossFee: 90_000,
        clinicShare: 60_000,
      });
      expect(paymentMonth.body.data.entries[0]).toEqual(
        expect.objectContaining({ kind: 'ACCRUAL', invoiceNumber: `INV/E2EF/${RUN_SUFFIX}` }),
      );
      expect(voidMonth.body.data.totals).toEqual({
        entryCount: 1,
        lineAmount: -150_000,
        grossFee: -90_000,
        clinicShare: -60_000,
      });
    });

    it('lists dr. A in the month summary and not dr. B', async () => {
      const response = await asStaff(
        'get',
        `/api/v1/clinician-fees/statements?period=${PAYMENT_PERIOD}`,
      );

      expect(response.status).toBe(200);
      const doctorIds = response.body.data.clinicians.map(
        (clinician: { doctorId: string }) => clinician.doctorId,
      );
      expect(doctorIds).toContain(doctorAId);
      expect(doctorIds).not.toContain(doctorBId);
    });

    it('exports the statement as CSV', async () => {
      const response = await asStaff(
        'get',
        `/api/v1/clinician-fees/statements/${doctorAId}/export?period=${PAYMENT_PERIOD}`,
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('Total jasa medis (bruto),90000');
    });

    it('rejects a malformed period', async () => {
      const response = await asStaff('get', `/api/v1/clinician-fees/statements?period=2026-13`);

      expect(response.status).toBe(400);
    });
  });

  describe('rule lifecycle', () => {
    it('updates and soft-deletes the rule without touching written entries', async () => {
      const updated = await asStaff('patch', `/api/v1/clinician-fee-rules/${ruleId}`).send({
        mode: 'PERCENT',
        value: 65,
        effectiveFrom: '2020-01-01',
        effectiveTo: '2099-12-31',
      });
      const deleted = await asStaff('delete', `/api/v1/clinician-fee-rules/${ruleId}`);
      const listed = await asStaff('get', '/api/v1/clinician-fee-rules');

      expect(updated.status).toBe(200);
      expect(updated.body.data).toEqual(
        expect.objectContaining({ value: 65, effectiveTo: '2099-12-31' }),
      );
      expect(deleted.status).toBe(200);
      expect(listed.body.data.some((rule: { id: string }) => rule.id === ruleId)).toBe(false);
      const accrual = await prisma.clinicianFeeEntry.findFirstOrThrow({
        where: { invoiceId, kind: 'ACCRUAL' },
      });
      expect(Number(accrual.ruleValue)).toBe(60);
    });
  });
});
