import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { BillingRepository } from './repository/billing.repository';
import { ServiceTariffRepository } from './repository/service-tariff.repository';

describe('Billing integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const billingRepositoryMock = {
    findEncounterForBilling: jest.fn(),
    findDispensedItemsByEncounterId: jest.fn(),
    findLiveInvoiceByEncounterId: jest.fn(),
    createInvoiceWithItems: jest.fn(),
    listInvoices: jest.fn(),
    findInvoiceWithRelationsById: jest.fn(),
    findInvoiceDetailById: jest.fn(),
    issueInvoice: jest.fn(),
    recordPayment: jest.fn(),
    voidInvoice: jest.fn(),
    addInvoiceItem: jest.fn(),
    removeInvoiceItem: jest.fn(),
    findPaymentsForCashierReport: jest.fn(),
  };

  const serviceTariffRepositoryMock = {
    listServiceTariffs: jest.fn(),
    findServiceTariffById: jest.fn(),
    findActiveConsultationTariffs: jest.fn(),
    findActiveTariffsByIcd9cmCodes: jest.fn(),
    createServiceTariff: jest.fn(),
    updateServiceTariff: jest.fn(),
  };

  const auditServiceMock = {
    record: jest.fn(),
    recordOrThrow: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const invoiceId = 'a3f2b1c4-5d6e-4a7b-8c9d-0e1f2a3b4c5d';
  const encounterId = 'e1d2c3b4-a596-4877-b8a9-c0d1e2f3a4b5';
  const patientId = 'f5e4d3c2-b1a0-4918-a7b6-c5d4e3f2a1b0';
  const tariffId = '7b0c1e58-4f6a-4f6e-9d10-2a9c3f4b5d6e';
  const timestamp = new Date('2026-07-28T03:00:00.000Z');

  const patientRecord = {
    id: patientId,
    mrn: 'RM-000123',
    fullName: 'Budi Santoso',
    ownerUserId: null,
  };

  const invoiceDetailRecord = {
    id: invoiceId,
    invoiceNumber: 'INV/20260728/0001',
    encounterId,
    patientId,
    status: 'DRAFT' as const,
    totalAmount: 50000,
    issuedAt: null,
    voidedAt: null,
    voidReason: null,
    voidedById: null,
    createdById: 'actor-user',
    createdAt: timestamp,
    updatedAt: timestamp,
    patient: patientRecord,
    items: [
      {
        id: 'item-1',
        invoiceId,
        itemType: 'CONSULTATION' as const,
        serviceTariffId: tariffId,
        medicationId: null,
        description: 'Konsultasi Dokter Umum',
        quantity: 1,
        unitPrice: 50000,
        amount: 50000,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    payment: null,
  };

  const invoiceWithRelationsRecord = {
    ...invoiceDetailRecord,
    patient: patientRecord,
    _count: { items: 1 },
  };

  const tariffRecord = {
    id: tariffId,
    code: 'KONSULTASI-UMUM',
    name: 'Konsultasi Dokter Umum',
    category: 'CONSULTATION' as const,
    icd9cmCode: null,
    price: 50000,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
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
      .overrideProvider(BillingRepository)
      .useValue(billingRepositoryMock)
      .overrideProvider(ServiceTariffRepository)
      .useValue(serviceTariffRepositoryMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
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
  });

  it('returns 401 when the bearer token is missing', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/invoices');

    expect(response.status).toBe(401);
  });

  it('returns 403 when the user lacks invoice.read permission', async () => {
    const token = await buildToken('no-read-user', 'no-read@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Encounter', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/invoices')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('lists invoices for a permitted user', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Invoice', scope: 'ANY' }]);
    billingRepositoryMock.listInvoices.mockResolvedValue({
      items: [invoiceWithRelationsRecord],
      page: 1,
      limit: 10,
      total: 1,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/invoices')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].invoiceNumber).toBe('INV/20260728/0001');
    expect(response.body.meta).toEqual({ page: 1, limit: 10, total: 1 });
  });

  it('generates a draft invoice from a finished encounter and reports gaps', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Invoice', scope: 'ANY' }]);
    billingRepositoryMock.findEncounterForBilling.mockResolvedValue({
      id: encounterId,
      status: 'FINISHED',
      patientId,
      procedures: [],
      immunizations: [],
    });
    billingRepositoryMock.findLiveInvoiceByEncounterId.mockResolvedValue(null);
    billingRepositoryMock.findDispensedItemsByEncounterId.mockResolvedValue([
      {
        medicationId: 'medication-1',
        quantity: 10,
        medication: { id: 'medication-1', name: 'Paracetamol 500 mg', unitPrice: null },
      },
    ]);
    serviceTariffRepositoryMock.findActiveConsultationTariffs.mockResolvedValue([tariffRecord]);
    serviceTariffRepositoryMock.findActiveTariffsByIcd9cmCodes.mockResolvedValue([]);
    billingRepositoryMock.createInvoiceWithItems.mockResolvedValue(invoiceDetailRecord);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ encounterId });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('DRAFT');
    expect(response.body.meta.gaps).toEqual([
      expect.objectContaining({ reason: 'UNPRICED_MEDICATION' }),
    ]);
  });

  it('returns 409 when the encounter is not FINISHED', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Invoice', scope: 'ANY' }]);
    billingRepositoryMock.findEncounterForBilling.mockResolvedValue({
      id: encounterId,
      status: 'IN_PROGRESS',
      patientId,
      procedures: [],
      immunizations: [],
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ encounterId });

    expect(response.status).toBe(409);
    expect(billingRepositoryMock.createInvoiceWithItems).not.toHaveBeenCalled();
  });

  it('records a payment whose amount repeats the invoice total', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Payment', scope: 'ANY' }]);
    billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue({
      ...invoiceWithRelationsRecord,
      status: 'ISSUED',
    });
    billingRepositoryMock.recordPayment.mockResolvedValue({
      ...invoiceDetailRecord,
      status: 'PAID',
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/invoices/${invoiceId}/payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'CASH', amount: 50000 });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('PAID');
  });

  it('rejects a payment whose amount disagrees with the invoice total', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Payment', scope: 'ANY' }]);
    billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue({
      ...invoiceWithRelationsRecord,
      status: 'ISSUED',
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/invoices/${invoiceId}/payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'CASH', amount: 45000 });

    expect(response.status).toBe(400);
    expect(billingRepositoryMock.recordPayment).not.toHaveBeenCalled();
  });

  it('voids an issued invoice with a reason and audits it', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Invoice', scope: 'ANY' }]);
    billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue({
      ...invoiceWithRelationsRecord,
      status: 'ISSUED',
    });
    billingRepositoryMock.voidInvoice.mockResolvedValue({
      ...invoiceDetailRecord,
      status: 'VOID',
      voidedAt: timestamp,
      voidReason: 'Wrong tariff applied',
      voidedById: 'actor-user',
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/invoices/${invoiceId}/void`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Wrong tariff applied' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('VOID');
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVOICE_VOIDED', resourceId: invoiceId }),
    );
  });

  it('rejects a void without a reason', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Invoice', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/invoices/${invoiceId}/void`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(billingRepositoryMock.voidInvoice).not.toHaveBeenCalled();
  });

  it('creates a service tariff for a permitted user', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'ServiceTariff', scope: 'ANY' }]);
    serviceTariffRepositoryMock.createServiceTariff.mockResolvedValue(tariffRecord);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/service-tariffs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'KONSULTASI-UMUM',
        name: 'Konsultasi Dokter Umum',
        category: 'CONSULTATION',
        price: 50000,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.code).toBe('KONSULTASI-UMUM');
  });

  it('rejects a tariff price with more than two decimal places', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'ServiceTariff', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/service-tariffs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'KONSULTASI-UMUM',
        name: 'Konsultasi Dokter Umum',
        category: 'CONSULTATION',
        price: 50000.005,
      });

    expect(response.status).toBe(400);
    expect(serviceTariffRepositoryMock.createServiceTariff).not.toHaveBeenCalled();
  });

  it('rejects a negative tariff price', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'ServiceTariff', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/service-tariffs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'KONSULTASI-UMUM',
        name: 'Konsultasi Dokter Umum',
        category: 'CONSULTATION',
        price: -1,
      });

    expect(response.status).toBe(400);
  });

  it('returns the daily cashier report for a permitted user', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Invoice', scope: 'ANY' }]);
    billingRepositoryMock.findPaymentsForCashierReport.mockResolvedValue([
      {
        method: 'CASH',
        amount: 50000,
        doctor: { id: 'doctor-1', fullName: 'Dr. Budi Santoso' },
      },
    ]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/reports/cashier-daily?date=2026-07-28')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.date).toBe('2026-07-28');
    expect(response.body.data.totals).toEqual({ count: 1, totalAmount: 50000 });
    expect(response.body.data.byMethod).toEqual([{ method: 'CASH', count: 1, totalAmount: 50000 }]);
  });

  it('returns 403 for the report without invoice.read permission', async () => {
    const token = await buildToken('no-read-user', 'no-read@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Payment', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/reports/cashier-daily')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('rejects a report date that is not a real calendar date', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Invoice', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/reports/cashier-daily?date=2026-02-31')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(billingRepositoryMock.findPaymentsForCashierReport).not.toHaveBeenCalled();
  });

  it('returns 403 for a tariff write without the write grant', async () => {
    const token = await buildToken('read-only-user', 'read-only@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'ServiceTariff', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/service-tariffs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'KONSULTASI-UMUM',
        name: 'Konsultasi Dokter Umum',
        category: 'CONSULTATION',
        price: 50000,
      });

    expect(response.status).toBe(403);
  });
  it('adds a tariff that has no ICD-9-CM mapping to a draft invoice', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Invoice', scope: 'ANY' }]);
    billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue(
      invoiceWithRelationsRecord,
    );
    serviceTariffRepositoryMock.findServiceTariffById.mockResolvedValue({
      ...tariffRecord,
      category: 'PROCEDURE',
      code: 'TIND-JAHIT-LUKA',
      name: 'Jahit Luka Ringan',
      price: 75000,
    });
    billingRepositoryMock.addInvoiceItem.mockResolvedValue({
      ...invoiceDetailRecord,
      totalAmount: 125000,
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/invoices/${invoiceId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ serviceTariffId: tariffId, quantity: 1 });

    expect(response.status).toBe(200);
    expect(response.body.data.totalAmount).toBe(125000);
    expect(billingRepositoryMock.addInvoiceItem).toHaveBeenCalledWith({
      invoiceId,
      item: expect.objectContaining({
        itemType: 'PROCEDURE',
        serviceTariffId: tariffId,
        description: 'Jahit Luka Ringan',
        quantity: 1,
        unitPrice: 75000,
        amount: 75000,
      }),
    });
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVOICE_ITEM_ADDED', resourceId: invoiceId }),
    );
  });

  it('rejects an invoice line with a zero quantity', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Invoice', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/invoices/${invoiceId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ serviceTariffId: tariffId, quantity: 0 });

    expect(response.status).toBe(400);
    expect(billingRepositoryMock.addInvoiceItem).not.toHaveBeenCalled();
  });

  it('returns 409 when adding a line to an issued invoice', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Invoice', scope: 'ANY' }]);
    billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue({
      ...invoiceWithRelationsRecord,
      status: 'ISSUED',
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/invoices/${invoiceId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ serviceTariffId: tariffId });

    expect(response.status).toBe(409);
  });

  it('removes a line from a draft invoice', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'Invoice', scope: 'ANY' }]);
    const itemId = '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b';
    billingRepositoryMock.findInvoiceDetailById.mockResolvedValue({
      ...invoiceDetailRecord,
      items: invoiceDetailRecord.items.map((item) => ({ ...item, id: itemId })),
    });
    billingRepositoryMock.removeInvoiceItem.mockResolvedValue({
      ...invoiceDetailRecord,
      items: [],
      totalAmount: 0,
    });

    const response = await request(app.getHttpServer())
      .delete(`/api/v1/v1/invoices/${invoiceId}/items/${itemId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([]);
    expect(response.body.data.totalAmount).toBe(0);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVOICE_ITEM_REMOVED', resourceId: invoiceId }),
    );
  });

  it('returns 403 for an invoice line write without the write grant', async () => {
    const token = await buildToken('read-only-user', 'read-only@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Invoice', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/invoices/${invoiceId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ serviceTariffId: tariffId });

    expect(response.status).toBe(403);
    expect(billingRepositoryMock.addInvoiceItem).not.toHaveBeenCalled();
  });
});
