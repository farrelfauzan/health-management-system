import { ClinicianFeeInvoiceRecord, ClinicianFeeRuleRecord } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { ClinicianFeeEntryRepository } from '../repository/clinician-fee-entry.repository';
import { ClinicianFeeRuleRepository } from '../repository/clinician-fee-rule.repository';
import { ClinicianFeeLedgerService } from './clinician-fee-ledger.service';

/**
 * P27-T06 acceptance at the service seam: a 60% consultation rule for dr. A
 * and a paid Rp150,000 consultation write one Rp90,000 accrual in the payment
 * month; voiding writes −Rp90,000 in the void month. Months are clinic-local.
 */
describe('ClinicianFeeLedgerService', () => {
  const doctorA = '11111111-1111-4111-8111-111111111111';
  const invoiceId = '44444444-4444-4444-8444-444444444444';
  const consultationItemId = '55555555-5555-4555-8555-555555555555';
  const medicationItemId = '66666666-6666-4666-8666-666666666666';
  const mockTransaction = {} as PrismaTransactionClient;

  const consultationRule: ClinicianFeeRuleRecord = {
    id: 'rule-60',
    serviceTariffId: null,
    category: 'CONSULTATION',
    doctorId: doctorA,
    mode: 'PERCENT',
    value: 60,
    effectiveFrom: '2026-10-01',
    effectiveTo: null,
  };

  const paidInvoice: ClinicianFeeInvoiceRecord = {
    invoiceId,
    doctorId: doctorA,
    lines: [
      {
        invoiceItemId: consultationItemId,
        itemType: 'CONSULTATION',
        serviceTariffId: 'tariff-consultation',
        tariffCategory: 'CONSULTATION',
        quantity: 1,
        amount: 150_000,
      },
      {
        invoiceItemId: medicationItemId,
        itemType: 'MEDICATION',
        serviceTariffId: null,
        tariffCategory: null,
        quantity: 10,
        amount: 50_000,
      },
    ],
  };

  const entryRepositoryMock = {
    findInvoiceForFees: jest.fn(),
    findAccrualsForInvoice: jest.fn(),
    createEntries: jest.fn(async (_tx: unknown, entries: unknown[]) => entries.length),
  };
  const ruleRepositoryMock = { findRulesForClinician: jest.fn() };
  const configServiceMock = { get: jest.fn().mockReturnValue('Asia/Jakarta') };

  const service = new ClinicianFeeLedgerService(
    entryRepositoryMock as unknown as ClinicianFeeEntryRepository,
    ruleRepositoryMock as unknown as ClinicianFeeRuleRepository,
    configServiceMock as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes one accrual of Rp90,000 in the clinic-local payment month', async () => {
    const inputPaidAt = new Date('2026-09-30T18:00:00.000Z');
    entryRepositoryMock.findInvoiceForFees.mockResolvedValue(paidInvoice);
    ruleRepositoryMock.findRulesForClinician.mockResolvedValue([consultationRule]);

    const actualCount = await service.recordAccrualsForPaidInvoice(mockTransaction, {
      invoiceId,
      paidAt: inputPaidAt,
    });

    expect(actualCount).toBe(1);
    expect(ruleRepositoryMock.findRulesForClinician).toHaveBeenCalledWith(mockTransaction, doctorA);
    expect(entryRepositoryMock.createEntries).toHaveBeenCalledWith(mockTransaction, [
      {
        kind: 'ACCRUAL',
        invoiceId,
        invoiceItemId: consultationItemId,
        doctorId: doctorA,
        ruleId: 'rule-60',
        ruleMode: 'PERCENT',
        ruleValue: 60,
        lineAmount: 150_000,
        grossFee: 90_000,
        clinicShare: 60_000,
        period: '2026-10',
        occurredAt: inputPaidAt,
      },
    ]);
  });

  it('writes nothing for an invoice with no clinician', async () => {
    entryRepositoryMock.findInvoiceForFees.mockResolvedValue({ ...paidInvoice, doctorId: null });

    const actualCount = await service.recordAccrualsForPaidInvoice(mockTransaction, {
      invoiceId,
      paidAt: new Date('2026-10-05T03:00:00.000Z'),
    });

    expect(actualCount).toBe(0);
    expect(ruleRepositoryMock.findRulesForClinician).not.toHaveBeenCalled();
    expect(entryRepositoryMock.createEntries).not.toHaveBeenCalled();
  });

  it('reverses each accrual with negated amounts in the void month', async () => {
    const inputVoidedAt = new Date('2026-11-02T02:00:00.000Z');
    entryRepositoryMock.findAccrualsForInvoice.mockResolvedValue([
      {
        invoiceItemId: consultationItemId,
        doctorId: doctorA,
        ruleId: 'rule-60',
        ruleMode: 'PERCENT',
        ruleValue: 60,
        lineAmount: 150_000,
        grossFee: 90_000,
        clinicShare: 60_000,
      },
    ]);

    const actualCount = await service.recordReversalsForVoidedInvoice(mockTransaction, {
      invoiceId,
      voidedAt: inputVoidedAt,
    });

    expect(actualCount).toBe(1);
    expect(entryRepositoryMock.createEntries).toHaveBeenCalledWith(mockTransaction, [
      expect.objectContaining({
        kind: 'REVERSAL',
        invoiceItemId: consultationItemId,
        lineAmount: -150_000,
        grossFee: -90_000,
        clinicShare: -60_000,
        period: '2026-11',
        occurredAt: inputVoidedAt,
      }),
    ]);
  });

  it('writes no reversal for an invoice that never accrued', async () => {
    entryRepositoryMock.findAccrualsForInvoice.mockResolvedValue([]);

    const actualCount = await service.recordReversalsForVoidedInvoice(mockTransaction, {
      invoiceId,
      voidedAt: new Date('2026-11-02T02:00:00.000Z'),
    });

    expect(actualCount).toBe(0);
    expect(entryRepositoryMock.createEntries).toHaveBeenCalledWith(mockTransaction, []);
  });
});
