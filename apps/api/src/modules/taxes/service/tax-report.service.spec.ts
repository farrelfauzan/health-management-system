import { TaxReportRecord, TaxSettingsRecord } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { TaxProfileService } from '../../tax-core/service/tax-profile.service';
import { TaxReportRepository } from '../repository/tax-report.repository';
import { TaxReportService } from './tax-report.service';

describe('TaxReportService (P27-T05)', () => {
  const taxReportRepositoryMock = {
    findPaymentsPaidBetween: jest.fn(),
    sumPaymentsPaidBetween: jest.fn(),
    findIssuedInvoiceLinesBetween: jest.fn(),
    listReportsForYear: jest.fn(),
    findReportById: jest.fn(),
    findReportByPeriodAndKind: jest.fn(),
    createReport: jest.fn(),
    updateReportComputation: jest.fn(),
    finalizeReport: jest.fn(),
  };
  const taxProfileServiceMock = { getTaxSettings: jest.fn() };
  const auditServiceMock = { record: jest.fn() };

  const service = new TaxReportService(
    taxReportRepositoryMock as unknown as TaxReportRepository,
    taxProfileServiceMock as unknown as TaxProfileService,
    auditServiceMock as unknown as AuditService,
    { get: jest.fn().mockReturnValue('Asia/Jakarta') } as unknown as ConfigService,
  );

  const actor = { sub: 'a1b2c3d4-0000-4000-8000-000000000001' } as CurrentUser;

  function buildSettings(overrides: Partial<TaxSettingsRecord> = {}): TaxSettingsRecord {
    return {
      taxpayerType: 'INDIVIDUAL',
      incomeTaxRegime: 'PP55_FINAL',
      pp55StartYear: 2025,
      isPkp: false,
      pkpSince: null,
      nitku: null,
      updatedById: null,
      updatedAt: null,
      ...overrides,
    };
  }

  function buildStoredPp55Report(overrides: Partial<TaxReportRecord> = {}): TaxReportRecord {
    return {
      id: 'report-feb',
      period: '2026-02',
      kind: 'PP55_OMZET',
      status: 'DRAFT',
      summary: {
        kind: 'PP55_OMZET',
        taxpayerType: 'INDIVIDUAL',
        ratePercent: 0.5,
        paymentCount: 1,
        yearToDateOmzetBefore: 300_000_000,
        nonTaxableAllowanceUsed: 200_000_000,
        totals: { grossOmzet: 400_000_000, taxableOmzet: 200_000_000, taxDue: 1_000_000 },
        taxAccountCode: '411128',
        depositTypeCode: '420',
        paymentDueDate: '2026-03-15',
        reportingDueDate: '2026-03-15',
      },
      lines: [],
      generatedAt: new Date('2026-03-02T00:00:00.000Z'),
      generatedById: actor.sub,
      finalizedAt: null,
      finalizedById: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-09-19T03:00:00.000Z'));
    taxProfileServiceMock.getTaxSettings.mockResolvedValue(buildSettings());
    taxReportRepositoryMock.findPaymentsPaidBetween.mockResolvedValue([
      {
        paymentId: 'pay-1',
        invoiceNumber: 'INV/20260210/0001',
        paidAt: new Date('2026-02-10T03:00:00.000Z'),
        method: 'CASH',
        amount: 400_000_000,
      },
    ]);
    taxReportRepositoryMock.sumPaymentsPaidBetween.mockResolvedValue(300_000_000);
    taxReportRepositoryMock.findReportByPeriodAndKind.mockResolvedValue(null);
    taxReportRepositoryMock.createReport.mockImplementation(async (payload) =>
      buildStoredPp55Report({ summary: payload.summary, lines: payload.lines }),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('drafts February for an individual on PP 55: Rp1,000,000 on the Rp200 juta above the line', async () => {
    const actual = await service.createReport({ period: '2026-02', kind: 'PP55_OMZET' }, actor);

    expect(actual.summary.totals).toEqual({
      grossOmzet: 400_000_000,
      taxableOmzet: 200_000_000,
      taxDue: 1_000_000,
    });
    expect(actual.summary).toMatchObject({
      taxAccountCode: '411128',
      paymentDueDate: '2026-03-15',
    });
    expect(actual.isOutOfDate).toBe(false);
  });

  it('refuses a PPN draft for a clinic that is not PKP', async () => {
    await expect(
      service.createReport({ period: '2026-02', kind: 'PPN_OUTPUT' }, actor),
    ).rejects.toMatchObject({ response: { code: 'TAX_REPORT_NOT_APPLICABLE' } });
  });

  it('refuses a second draft of the same month and a month that has not started', async () => {
    taxReportRepositoryMock.findReportByPeriodAndKind.mockResolvedValue(buildStoredPp55Report());

    await expect(
      service.createReport({ period: '2026-02', kind: 'PP55_OMZET' }, actor),
    ).rejects.toMatchObject({ response: { code: 'TAX_REPORT_EXISTS' } });
    await expect(
      service.createReport({ period: '2026-10', kind: 'PP55_OMZET' }, actor),
    ).rejects.toMatchObject({ response: { code: 'TAX_REPORT_PERIOD_IN_FUTURE' } });
  });

  it('refuses to finalize the running month', async () => {
    taxReportRepositoryMock.findReportById.mockResolvedValue(
      buildStoredPp55Report({ period: '2026-09' }),
    );

    await expect(service.finalizeReport('report-feb', actor)).rejects.toMatchObject({
      response: { code: 'TAX_REPORT_PERIOD_OPEN' },
    });
  });

  it('keeps a finalized report as filed and shows what changed since, the void example', async () => {
    taxReportRepositoryMock.findReportById.mockResolvedValue(
      buildStoredPp55Report({ status: 'FINALIZED', finalizedAt: new Date('2026-03-02T00:00:00Z') }),
    );
    taxReportRepositoryMock.findPaymentsPaidBetween.mockResolvedValue([]);

    const actual = await service.getReport('report-feb');

    expect(actual.summary.totals).toMatchObject({ taxDue: 1_000_000 });
    expect(actual.isOutOfDate).toBe(true);
    expect(actual.differences).toContainEqual({ field: 'taxDue', stored: 1_000_000, live: 0 });
    await expect(service.recomputeReport('report-feb', actor)).rejects.toMatchObject({
      response: { code: 'TAX_REPORT_FINALIZED' },
    });
  });

  it('audits finalizing and exporting', async () => {
    taxReportRepositoryMock.findReportById.mockResolvedValue(buildStoredPp55Report());
    taxReportRepositoryMock.finalizeReport.mockImplementation(async (payload) =>
      buildStoredPp55Report({ status: 'FINALIZED', finalizedAt: payload.finalizedAt }),
    );

    await service.finalizeReport('report-feb', actor);
    const exported = await service.exportReport('report-feb', actor);

    expect(auditServiceMock.record.mock.calls.map(([event]) => event.action)).toEqual([
      'TAX_REPORT_FINALIZED',
      'EXPORT',
    ]);
    expect(exported.fileName).toBe('pajak-pp55-omzet-2026-02.csv');
    expect(exported.csv).toContain('PPh final terutang,1000000');
  });
});
