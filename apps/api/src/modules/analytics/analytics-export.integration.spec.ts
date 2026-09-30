import { randomUUID } from 'node:crypto';

import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';

const FINANCE_PATH = '/api/v1/v1/analytics/finance';
const EXPORT_PATH = '/api/v1/v1/analytics/finance/export';
const DAY = '2031-10-15';
const ADMIN_PERMISSIONS = [
  { action: 'read-finance', resource: 'Analytics', scope: 'ANY' as const },
  { action: 'export', resource: 'Analytics', scope: 'ANY' as const },
];
const PHARMACIST_PERMISSIONS = [
  { action: 'read-pharmacy', resource: 'Analytics', scope: 'ANY' as const },
];
const BILLS = [
  { amount: 1_500_000, method: 'CASH' as const },
  { amount: 2_000_000, method: 'QRIS' as const },
  { amount: 750_000, method: 'TRANSFER' as const },
];

/**
 * P29-T10 against a real PostgreSQL, with the real audit service: an ADMIN's
 * finance export carries the same figures as the screen and leaves exactly
 * one EXPORT audit row with the filters; a PHARMACIST is refused before any
 * file is built. Bills sit on 15 October 2031 under a poli made for this
 * spec, and every request filters by it.
 */
describe('Analytics export against PostgreSQL', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;

  const suffix = `p29t10-${randomUUID().slice(0, 8)}`;
  const specialtyId = randomUUID();
  const doctorId = randomUUID();
  const patientId = randomUUID();
  const registrationIds: string[] = [];
  const invoiceIds: string[] = [];
  let actorUserId = '';

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const featureAvailabilityCacheMock = { isEnabled: jest.fn(async () => true) };

  function mockRole(code: string, permissions: typeof ADMIN_PERMISSIONS): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: actorUserId,
      roles: [{ role: { code, permissions: permissions.map((permission) => ({ permission })) } }],
    });
  }

  async function signIn(): Promise<string> {
    return jwtService.signAsync(
      { sub: actorUserId, email: `${suffix}@example.test` },
      { secret: 'dev-access-secret' },
    );
  }

  async function seedBills(): Promise<void> {
    for (const [index, bill] of BILLS.entries()) {
      const at = new Date(`${DAY}T${String(9 + index).padStart(2, '0')}:00:00+07:00`);
      const registration = await prisma.registration.create({
        data: {
          patientId,
          specialtyId,
          poliQueueNumber: index + 1,
          status: 'COMPLETED',
          payerType: 'GENERAL',
          registeredAt: at,
          checkedInAt: at,
        },
      });
      registrationIds.push(registration.id);
      const encounter = await prisma.encounter.create({
        data: {
          registrationId: registration.id,
          patientId,
          doctorId,
          status: 'FINISHED',
          startedAt: at,
        },
      });
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-${suffix}-${index}`,
          encounterId: encounter.id,
          patientId,
          status: 'PAID',
          totalAmount: bill.amount,
          issuedAt: at,
          items: {
            create: {
              itemType: 'CONSULTATION',
              description: 'Konsultasi',
              quantity: 1,
              unitPrice: bill.amount,
              amount: bill.amount,
            },
          },
          payment: {
            create: {
              method: bill.method,
              amount: bill.amount,
              paidAt: at,
              cashierId: actorUserId,
            },
          },
        },
      });
      invoiceIds.push(invoice.id);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(FeatureAvailabilityCacheService)
      .useValue(featureAvailabilityCacheMock)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    jwtService = moduleRef.get(JwtService);
    prisma = moduleRef.get(PrismaService);
    const actor = await prisma.user.create({
      data: {
        email: `${suffix}@example.test`,
        passwordHash: 'not-a-real-hash',
        fullName: 'Admin Ekspor',
      },
      select: { id: true },
    });
    actorUserId = actor.id;
    await prisma.specialty.create({ data: { id: specialtyId, name: `Poli ${suffix}` } });
    await prisma.doctorProfile.create({
      data: { id: doctorId, licenseNumber: `LIC-${suffix}`, fullName: 'dr. Ekspor', specialtyId },
    });
    await prisma.patientProfile.create({
      data: {
        id: patientId,
        mrn: `MRN-${suffix}`,
        fullName: 'Patient Ekspor',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '0800000000',
        address: 'Jl. Uji',
      },
    });
    await seedBills();
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.encounter.deleteMany({ where: { registrationId: { in: registrationIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: patientId } });
    await prisma.doctorProfile.deleteMany({ where: { id: doctorId } });
    await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    await prisma.user.deleteMany({ where: { id: actorUserId } });
    await app.close();
  });

  it('given ADMIN exports Finance, then the CSV matches the screen and one EXPORT audit row holds the filters', async () => {
    mockRole('ADMIN', ADMIN_PERMISSIONS);
    const token = await signIn();
    const query = { from: DAY, to: DAY, specialtyId };

    const [screen, exported] = await Promise.all([
      request(app.getHttpServer())
        .get(FINANCE_PATH)
        .query(query)
        .set('Authorization', `Bearer ${token}`),
      request(app.getHttpServer())
        .get(EXPORT_PATH)
        .query(query)
        .set('Authorization', `Bearer ${token}`),
    ]);
    const lines = exported.text.replace(/^\uFEFF/, '').split('\r\n');
    const audits = await prisma.auditLog.findMany({
      where: { actorUserId, action: 'EXPORT', resource: 'analytics' },
    });

    expect(exported.status).toBe(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.headers['content-disposition']).toContain(
      `metaklinik-finance-${DAY}-${DAY}.csv`,
    );
    expect(exported.text.startsWith('\uFEFF')).toBe(true);
    // The label holds a comma, so the CSV quotes it.
    expect(lines).toContain(
      `"Pendapatan (per tanggal invoice, termasuk PPN)",${screen.body.data.totals.revenue}`,
    );
    for (const method of screen.body.data.breakdowns.paymentMethods) {
      expect(lines.some((line) => line.endsWith(`,${method.payments},${method.amount}`))).toBe(
        true,
      );
    }
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({
      dashboard: 'finance',
      filters: { from: DAY, to: DAY, specialtyId },
    });
  });

  it('given a PHARMACIST with no export key, then 403 and no file', async () => {
    mockRole('PHARMACIST', PHARMACIST_PERMISSIONS);
    const token = await signIn();
    const before = await prisma.auditLog.count({ where: { actorUserId, action: 'EXPORT' } });

    const response = await request(app.getHttpServer())
      .get(EXPORT_PATH)
      .query({ from: DAY, to: DAY, specialtyId })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.headers['content-type']).not.toContain('text/csv');
    expect(await prisma.auditLog.count({ where: { actorUserId, action: 'EXPORT' } })).toBe(before);
  });

  it('refuses an unknown table with 400', async () => {
    mockRole('ADMIN', ADMIN_PERMISSIONS);
    const token = await signIn();

    const response = await request(app.getHttpServer())
      .get(EXPORT_PATH)
      .query({ from: DAY, to: DAY, specialtyId, tables: 'summary,patients' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ANALYTICS_EXPORT_UNKNOWN_TABLE');
  });
});
