import { randomUUID } from 'node:crypto';

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

const FINANCE_PATH = '/api/v1/v1/analytics/finance';
const CASHIER_PATH = '/api/v1/v1/reports/cashier-daily';
const FINANCE_PERMISSIONS = [
  { action: 'read-finance', resource: 'Analytics', scope: 'ANY' as const },
  { action: 'read', resource: 'Invoice', scope: 'ANY' as const },
];
// A month nobody else seeds, reconciled day by day against the cashier report.
const RECONCILED_MONTH = '2031-11';
const DAYS_IN_RECONCILED_MONTH = 30;
const FIFTEENTH = '2031-11-15';
const PAYMENT_METHODS = ['CASH', 'QRIS', 'TRANSFER', 'INSURANCE'] as const;
const MS_PER_DAY = 86_400_000;
const UNPAID_AGE_DAYS = 10;

type PaymentMethod = (typeof PAYMENT_METHODS)[number];
type InvoiceStatus = 'ISSUED' | 'PAID' | 'VOID';

type SeededBill = {
  doctorId: string;
  payerType: 'GENERAL' | 'BPJS';
  status: InvoiceStatus;
  amount: number;
  taxAmount?: number;
  issuedAt: Date | null;
  paidAt?: Date;
  voidedAt?: Date;
  method?: PaymentMethod;
};

/**
 * P29-T08 against a real PostgreSQL. Every day of November 2031 carries bills
 * paid the day they were issued, so on each day the finance dashboard must
 * agree with the cashier report to the rupiah: cash, method, clinician and
 * service. December holds the cases the two clocks tell apart: a bill paid
 * the next day, voids, tax and an unpaid bill ten days old.
 */
describe('Analytics finance against PostgreSQL', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;

  const suffix = `p29t08-${randomUUID().slice(0, 8)}`;
  const specialtyId = randomUUID();
  const doctorIds = [randomUUID(), randomUUID()];
  const patientId = randomUUID();
  const registrationIds: string[] = [];
  const invoiceIds: string[] = [];
  let cashierId = '';
  let poliQueueNumber = 0;

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const featureAvailabilityCacheMock = { isEnabled: jest.fn(async () => true) };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  function atJakarta(day: string, time: string): Date {
    return new Date(`${day}T${time}:00+07:00`);
  }

  function toJakartaDate(instant: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(instant);
  }

  function dayOfMonth(day: number): string {
    return `${RECONCILED_MONTH}-${String(day).padStart(2, '0')}`;
  }

  /** One to three bills a day; the 15th is Rp 4.250.000 across three methods. */
  function buildReconciledBills(day: number): SeededBill[] {
    if (dayOfMonth(day) === FIFTEENTH) {
      return [
        { amount: 1_500_000, method: 'CASH' },
        { amount: 2_000_000, method: 'QRIS' },
        { amount: 750_000, method: 'TRANSFER' },
      ].map((bill, index) =>
        buildPaidSameDay(day, index, bill.amount, bill.method as PaymentMethod),
      );
    }
    return Array.from({ length: (day % 3) + 1 }, (_, index) =>
      buildPaidSameDay(
        day,
        index,
        100_000 + day * 1_000 + index * 250.5,
        PAYMENT_METHODS[(day + index) % PAYMENT_METHODS.length] as PaymentMethod,
      ),
    );
  }

  function buildPaidSameDay(
    day: number,
    index: number,
    amount: number,
    method: PaymentMethod,
  ): SeededBill {
    const issuedAt = atJakarta(dayOfMonth(day), `0${8 + index}:00`.slice(-5));
    return {
      doctorId: doctorIds[index % 2] as string,
      payerType: index % 2 === 0 ? 'BPJS' : 'GENERAL',
      status: 'PAID',
      amount,
      issuedAt,
      paidAt: new Date(issuedAt.getTime() + 30 * 60_000),
      method,
    };
  }

  function buildDecemberBills(): SeededBill[] {
    const doctorId = doctorIds[0] as string;
    return [
      // Issued on the 2nd, paid on the 3rd: revenue on one day, cash on the next.
      {
        doctorId,
        payerType: 'GENERAL',
        status: 'PAID',
        amount: 300_000,
        issuedAt: atJakarta('2031-12-02', '10:00'),
        paidAt: atJakarta('2031-12-03', '09:00'),
        method: 'CASH',
      },
      // Voided after issue counts as a void; a voided draft billed nobody.
      {
        doctorId,
        payerType: 'GENERAL',
        status: 'VOID',
        amount: 80_000,
        issuedAt: atJakarta('2031-12-04', '09:00'),
        voidedAt: atJakarta('2031-12-04', '11:00'),
      },
      {
        doctorId,
        payerType: 'GENERAL',
        status: 'VOID',
        amount: 55_000,
        issuedAt: null,
        voidedAt: atJakarta('2031-12-04', '12:00'),
      },
      // Tax-inclusive: Rp 111.000 of which Rp 11.000 is PPN.
      {
        doctorId,
        payerType: 'GENERAL',
        status: 'PAID',
        amount: 111_000,
        taxAmount: 11_000,
        issuedAt: atJakarta('2031-12-05', '10:00'),
        paidAt: atJakarta('2031-12-05', '10:30'),
        method: 'QRIS',
      },
      // Unpaid, issued ten days ago.
      {
        doctorId,
        payerType: 'BPJS',
        status: 'ISSUED',
        amount: 175_000,
        issuedAt: new Date(Date.now() - UNPAID_AGE_DAYS * MS_PER_DAY),
      },
    ];
  }

  async function seedBill(bill: SeededBill): Promise<void> {
    poliQueueNumber += 1;
    const registeredAt = bill.issuedAt ?? bill.voidedAt ?? new Date();
    const registration = await prisma.registration.create({
      data: {
        patientId,
        specialtyId,
        poliQueueNumber,
        status: 'COMPLETED',
        payerType: bill.payerType,
        registeredAt,
        checkedInAt: registeredAt,
      },
    });
    registrationIds.push(registration.id);
    const encounter = await prisma.encounter.create({
      data: {
        registrationId: registration.id,
        patientId,
        doctorId: bill.doctorId,
        status: 'FINISHED',
        startedAt: registeredAt,
      },
    });
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${suffix}-${poliQueueNumber}`,
        encounterId: encounter.id,
        patientId,
        status: bill.status,
        totalAmount: bill.amount,
        taxAmount: bill.taxAmount ?? 0,
        issuedAt: bill.issuedAt,
        voidedAt: bill.voidedAt ?? null,
        items: {
          create: {
            itemType: 'CONSULTATION',
            description: 'Konsultasi',
            quantity: 1,
            unitPrice: bill.amount,
            amount: bill.amount,
            taxAmount: bill.taxAmount ?? 0,
          },
        },
      },
    });
    invoiceIds.push(invoice.id);
    if (bill.paidAt && bill.method) {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          method: bill.method,
          amount: bill.amount,
          paidAt: bill.paidAt,
          cashierId,
        },
      });
    }
  }

  async function seedClinic(): Promise<void> {
    const cashier = await prisma.user.create({
      data: { email: `${suffix}@example.test`, passwordHash: 'not-a-real-hash', fullName: 'Kasir' },
      select: { id: true },
    });
    cashierId = cashier.id;
    await prisma.specialty.create({ data: { id: specialtyId, name: `Poli ${suffix}` } });
    await prisma.doctorProfile.createMany({
      data: doctorIds.map((id, index) => ({
        id,
        licenseNumber: `LIC-${suffix}-${index}`,
        fullName: `dr. Finance ${index}`,
        specialtyId,
      })),
    });
    await prisma.patientProfile.create({
      data: {
        id: patientId,
        mrn: `MRN-${suffix}`,
        fullName: 'Patient Finance',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '0800000000',
        address: 'Jl. Uji',
      },
    });
  }

  async function buildToken(): Promise<string> {
    return jwtService.signAsync(
      { sub: 'admin-user', email: 'admin@hms.local' },
      { secret: 'dev-access-secret' },
    );
  }

  async function readFinance(query: Record<string, string>): Promise<request.Response> {
    return request(app.getHttpServer())
      .get(FINANCE_PATH)
      .query({ compare: 'false', ...query })
      .set('Authorization', `Bearer ${await buildToken()}`);
  }

  async function readCashier(date: string): Promise<request.Response> {
    return request(app.getHttpServer())
      .get(CASHIER_PATH)
      .query({ date })
      .set('Authorization', `Bearer ${await buildToken()}`);
  }

  /** `{ key: amount }` for the lines that carry money, so zero rows never decide a match. */
  function toAmountMap(
    lines: ReadonlyArray<Record<string, unknown>>,
    keyField: string,
    amountField: string,
  ): Record<string, number> {
    return Object.fromEntries(
      lines
        .filter((line) => Number(line[amountField]) > 0)
        .map((line) => [String(line[keyField]), Number(line[amountField])]),
    );
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
    const bills = [
      ...Array.from({ length: DAYS_IN_RECONCILED_MONTH }, (_, index) =>
        buildReconciledBills(index + 1),
      ).flat(),
      ...buildDecemberBills(),
    ];
    for (const bill of bills) {
      await seedBill(bill);
    }
  });

  beforeEach(() => {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'admin-user',
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: FINANCE_PERMISSIONS.map((permission) => ({ permission })),
          },
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.encounter.deleteMany({ where: { registrationId: { in: registrationIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: patientId } });
    await prisma.doctorProfile.deleteMany({ where: { id: { in: doctorIds } } });
    await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    await prisma.user.deleteMany({ where: { id: cashierId } });
    await app.close();
  });

  it('agrees with the cashier report on every day of the month: cash, method, clinician and service', async () => {
    for (let day = 1; day <= DAYS_IN_RECONCILED_MONTH; day += 1) {
      const date = dayOfMonth(day);
      const [finance, cashier] = await Promise.all([
        readFinance({ from: date, to: date }),
        readCashier(date),
      ]);
      const { totals, breakdowns } = finance.body.data;

      expect(totals.cashReceived).toBeGreaterThan(0);
      expect({ date, cash: totals.cashReceived }).toEqual({
        date,
        cash: cashier.body.data.totals.totalAmount,
      });
      expect(toAmountMap(breakdowns.paymentMethods, 'method', 'amount')).toEqual(
        toAmountMap(cashier.body.data.byMethod, 'method', 'totalAmount'),
      );
      expect(toAmountMap(breakdowns.doctors, 'doctorId', 'revenue')).toEqual(
        toAmountMap(cashier.body.data.byDoctor, 'doctorId', 'totalAmount'),
      );
      expect(toAmountMap(breakdowns.itemTypes, 'itemType', 'amount')).toEqual(
        toAmountMap(cashier.body.data.byItemType, 'itemType', 'totalAmount'),
      );
    }
  });

  it('given the cashier report for the 15th totals Rp 4.250.000, then finance shows Rp 4.250.000', async () => {
    const [finance, cashier] = await Promise.all([
      readFinance({ from: FIFTEENTH, to: FIFTEENTH }),
      readCashier(FIFTEENTH),
    ]);

    expect(cashier.body.data.totals.totalAmount).toBe(4_250_000);
    expect(finance.body.data.totals).toMatchObject({ revenue: 4_250_000, cashReceived: 4_250_000 });
  });

  it('counts a bill on the day it was issued and its cash on the day it was paid', async () => {
    const [issuedDay, paidDay] = await Promise.all([
      readFinance({ from: '2031-12-02', to: '2031-12-02', specialtyId }),
      readFinance({ from: '2031-12-03', to: '2031-12-03', specialtyId }),
    ]);

    expect(issuedDay.body.data.totals).toMatchObject({ revenue: 300_000, cashReceived: 0 });
    expect(paidDay.body.data.totals).toMatchObject({ revenue: 0, cashReceived: 300_000 });
  });

  it('counts a void after issue, never a voided draft, and keeps both out of revenue', async () => {
    const response = await readFinance({ from: '2031-12-04', to: '2031-12-04', specialtyId });

    expect(response.body.data.totals).toMatchObject({
      revenue: 0,
      voidedInvoices: 1,
      voidedAmount: 80_000,
    });
  });

  it('shows the PPN inside revenue, never added to it', async () => {
    const response = await readFinance({ from: '2031-12-05', to: '2031-12-05', specialtyId });

    expect(response.body.data.totals).toMatchObject({
      revenue: 111_000,
      taxAmount: 11_000,
      unpaidInvoices: 0,
    });
  });

  it('counts a bill issued in the period and not yet paid as revenue that is still unpaid', async () => {
    const issuedDay = toJakartaDate(new Date(Date.now() - UNPAID_AGE_DAYS * MS_PER_DAY));

    const response = await readFinance({ from: issuedDay, to: issuedDay, specialtyId });

    expect(response.body.data.totals).toMatchObject({
      revenue: 175_000,
      cashReceived: 0,
      unpaidInvoices: 1,
      unpaidAmount: 175_000,
    });
  });

  it('given an invoice issued 10 days ago and unpaid, then it is in the 8–30 day bucket', async () => {
    const response = await readFinance({ from: '2031-12-01', to: '2031-12-31', specialtyId });

    expect(response.body.data.breakdowns.outstanding.aging).toEqual([
      { bucket: '0-7', invoices: 0, amount: 0 },
      { bucket: '8-30', invoices: 1, amount: 175_000 },
      { bucket: 'over-30', invoices: 0, amount: 0 },
    ]);
  });

  it('narrows revenue to one payer through the visit the bill is for', async () => {
    const [all, bpjs] = await Promise.all([
      readFinance({ from: '2031-11-01', to: '2031-11-30', specialtyId }),
      readFinance({ from: '2031-11-01', to: '2031-11-30', specialtyId, payerType: 'BPJS' }),
    ]);
    const bpjsRow = all.body.data.breakdowns.payers.find(
      (row: { payerType: string | null }) => row.payerType === 'BPJS',
    );

    expect(bpjs.body.data.totals.revenue).toBe(bpjsRow.revenue);
    expect(bpjs.body.data.totals.revenue).toBeGreaterThan(0);
    expect(bpjs.body.data.totals.revenue).toBeLessThan(all.body.data.totals.revenue);
  });

  it('carries no patient or invoice number anywhere in the payload', async () => {
    const response = await readFinance({ from: '2031-11-01', to: '2031-11-30', specialtyId });
    const body = JSON.stringify(response.body);

    expect(body).not.toContain(patientId);
    expect(body).not.toContain(`INV-${suffix}`);
    expect(body).not.toContain(`MRN-${suffix}`);
  });
});
