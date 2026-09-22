import { TaxReportRecord, TaxSettingsRecord } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicianFeeStatementService } from '../../clinician-fee/service/clinician-fee-statement.service';
import { TaxProfileService } from '../../tax-core/service/tax-profile.service';
import { ClinicianTaxIdentityRepository } from '../repository/clinician-tax-identity.repository';
import { Pph21TaxBracketRepository } from '../repository/pph21-tax-bracket.repository';
import { TaxReportRepository } from '../repository/tax-report.repository';
import { TaxReportService } from './tax-report.service';

const HPP_BRACKETS = [
  { id: 'b1', effectiveFrom: '2022-01-01', lowerBound: 0, upperBound: 60_000_000, ratePercent: 5 },
  {
    id: 'b2',
    effectiveFrom: '2022-01-01',
    lowerBound: 60_000_000,
    upperBound: 250_000_000,
    ratePercent: 15,
  },
  {
    id: 'b3',
    effectiveFrom: '2022-01-01',
    lowerBound: 250_000_000,
    upperBound: 500_000_000,
    ratePercent: 25,
  },
  {
    id: 'b4',
    effectiveFrom: '2022-01-01',
    lowerBound: 500_000_000,
    upperBound: 5_000_000_000,
    ratePercent: 30,
  },
  {
    id: 'b5',
    effectiveFrom: '2022-01-01',
    lowerBound: 5_000_000_000,
    upperBound: null,
    ratePercent: 35,
  },
];

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
  const pph21TaxBracketRepositoryMock = { listBrackets: jest.fn() };
  const clinicianTaxIdentityRepositoryMock = {
    findIdentities: jest.fn(),
    findIdentifiers: jest.fn(),
  };
  const clinicianFeeStatementServiceMock = { getPeriodSummary: jest.fn() };

  const service = new TaxReportService(
    taxReportRepositoryMock as unknown as TaxReportRepository,
    taxProfileServiceMock as unknown as TaxProfileService,
    auditServiceMock as unknown as AuditService,
    pph21TaxBracketRepositoryMock as unknown as Pph21TaxBracketRepository,
    clinicianTaxIdentityRepositoryMock as unknown as ClinicianTaxIdentityRepository,
    clinicianFeeStatementServiceMock as unknown as ClinicianFeeStatementService,
    { get: jest.fn().mockReturnValue('Asia/Jakarta') } as unknown as ConfigService,
  );

  function mockOctoberFees(clinicians: Array<{ doctorId: string; grossFee: number }>): void {
    clinicianFeeStatementServiceMock.getPeriodSummary.mockResolvedValue({
      period: '2026-10',
      clinicians: clinicians.map((clinician) => ({
        doctorId: clinician.doctorId,
        doctorName: clinician.doctorId,
        profession: 'DOCTOR',
        totals: {
          entryCount: 1,
          lineAmount: clinician.grossFee,
          grossFee: clinician.grossFee,
          clinicShare: 0,
        },
      })),
      totals: { entryCount: clinicians.length, lineAmount: 0, grossFee: 0, clinicShare: 0 },
    });
  }

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
    pph21TaxBracketRepositoryMock.listBrackets.mockResolvedValue(HPP_BRACKETS);
    clinicianTaxIdentityRepositoryMock.findIdentities.mockResolvedValue([]);
    clinicianTaxIdentityRepositoryMock.findIdentifiers.mockResolvedValue([]);
    mockOctoberFees([]);
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

  describe('PPh 21 bukan pegawai (P27-T07)', () => {
    const DR_A = { doctorId: 'dr-a', fullName: 'Andi', profession: 'DOCTOR' as const };

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-05T03:00:00.000Z'));
      mockOctoberFees([{ doctorId: DR_A.doctorId, grossFee: 20_000_000 }]);
      taxReportRepositoryMock.createReport.mockImplementation(async (payload) =>
        buildStoredPp55Report({
          id: 'report-oct-pph21',
          period: '2026-10',
          kind: 'PPH21_NON_EMPLOYEE',
          summary: payload.summary,
          lines: payload.lines,
        }),
      );
      taxReportRepositoryMock.finalizeReport.mockImplementation(async (payload) =>
        buildStoredPp55Report({
          id: payload.id,
          period: '2026-10',
          kind: 'PPH21_NON_EMPLOYEE',
          status: 'FINALIZED',
          summary: payload.summary,
          lines: payload.lines,
          finalizedAt: payload.finalizedAt,
          finalizedById: payload.finalizedById,
        }),
      );
    });

    it('drafts October for dr. A: Rp20 juta gross, DPP Rp10 juta, PPh 21 Rp500.000, due 15 and 20 November', async () => {
      clinicianTaxIdentityRepositoryMock.findIdentities.mockResolvedValue([
        { ...DR_A, npwp: null, nikLast4: '0001' },
      ]);

      const actual = await service.createReport(
        { period: '2026-10', kind: 'PPH21_NON_EMPLOYEE' },
        actor,
      );

      expect(actual.summary).toMatchObject({
        kind: 'PPH21_NON_EMPLOYEE',
        totals: { grossFee: 20_000_000, taxBase: 10_000_000, taxAmount: 500_000 },
        incompleteIdentityCount: 0,
        paymentDueDate: '2026-11-15',
        reportingDueDate: '2026-11-20',
      });
      expect(actual.lines[0]).toMatchObject({
        doctorName: 'Andi',
        identityStatus: 'NIK',
        identityMasked: '••••••••0001',
        taxAmount: 500_000,
      });
    });

    it('is always applicable, whatever the regime and PKP status', async () => {
      taxProfileServiceMock.getTaxSettings.mockResolvedValue(
        buildSettings({ incomeTaxRegime: 'GENERAL', isPkp: false }),
      );
      taxReportRepositoryMock.listReportsForYear.mockResolvedValue([]);

      const actual = await service.listReports(2026);

      expect(actual.meta.applicableKinds).toEqual(['PPH21_NON_EMPLOYEE']);
    });

    it('flags a clinician without NIK or NPWP and refuses to finalize the month', async () => {
      clinicianTaxIdentityRepositoryMock.findIdentities.mockResolvedValue([
        { ...DR_A, npwp: null, nikLast4: null },
      ]);

      const drafted = await service.createReport(
        { period: '2026-10', kind: 'PPH21_NON_EMPLOYEE' },
        actor,
      );
      taxReportRepositoryMock.findReportById.mockResolvedValue(
        await taxReportRepositoryMock.createReport.mock.results[0]?.value,
      );

      expect(drafted.summary).toMatchObject({ incompleteIdentityCount: 1 });
      expect(drafted.lines[0]).toMatchObject({ identityStatus: 'MISSING', taxAmount: 500_000 });
      await expect(service.finalizeReport('report-oct-pph21', actor)).rejects.toMatchObject({
        response: { code: 'TAX_REPORT_IDENTITY_INCOMPLETE' },
      });
      expect(taxReportRepositoryMock.finalizeReport).not.toHaveBeenCalled();
    });

    it('finalizes once the identity is filled in, and prefers the NPWP', async () => {
      clinicianTaxIdentityRepositoryMock.findIdentities.mockResolvedValue([
        { ...DR_A, npwp: '0123456789012345', nikLast4: '0001' },
      ]);
      taxReportRepositoryMock.findReportById.mockResolvedValue(
        buildStoredPp55Report({
          id: 'report-oct-pph21',
          period: '2026-10',
          kind: 'PPH21_NON_EMPLOYEE',
        }),
      );

      const actual = await service.finalizeReport('report-oct-pph21', actor);

      expect(actual.status).toBe('FINALIZED');
      expect(actual.lines[0]).toMatchObject({
        identityStatus: 'NPWP',
        identityMasked: '0123456789012345',
      });
    });

    it('refuses to compute when no bracket set has started for the period', async () => {
      pph21TaxBracketRepositoryMock.listBrackets.mockResolvedValue(
        HPP_BRACKETS.map((bracket) => ({ ...bracket, effectiveFrom: '2027-01-01' })),
      );

      await expect(
        service.createReport({ period: '2026-10', kind: 'PPH21_NON_EMPLOYEE' }, actor),
      ).rejects.toMatchObject({ response: { code: 'TAX_BRACKETS_UNAVAILABLE' } });
    });

    it('reveals the full identities with an audit row that never carries the number', async () => {
      clinicianTaxIdentityRepositoryMock.findIdentities.mockResolvedValue([
        { ...DR_A, npwp: null, nikLast4: '0001' },
      ]);
      clinicianTaxIdentityRepositoryMock.findIdentifiers.mockResolvedValue([
        { doctorId: DR_A.doctorId, npwp: null, nik: '3171000000000001' },
      ]);
      const stored = buildStoredPp55Report({
        id: 'report-oct-pph21',
        period: '2026-10',
        kind: 'PPH21_NON_EMPLOYEE',
        lines: [{ doctorId: DR_A.doctorId } as never],
      });
      taxReportRepositoryMock.findReportById.mockResolvedValue(stored);

      const actual = await service.revealIdentifiers('report-oct-pph21', actor);

      expect(actual.clinicians).toEqual([
        { doctorId: 'dr-a', identityKind: 'NIK', taxIdentityNumber: '3171000000000001' },
      ]);
      const auditCall = auditServiceMock.record.mock.calls.find(
        ([input]) => input.action === 'DOCTOR_IDENTIFIER_UNMASKED',
      );
      expect(auditCall?.[0]).toMatchObject({
        resource: 'tax-report',
        resourceId: 'report-oct-pph21',
        metadata: { period: '2026-10', doctorIds: ['dr-a'], fields: ['NIK'] },
      });
      expect(JSON.stringify(auditCall)).not.toContain('3171000000000001');
    });

    it('refuses to reveal identities on a PP 55 report', async () => {
      taxReportRepositoryMock.findReportById.mockResolvedValue(buildStoredPp55Report());

      await expect(service.revealIdentifiers('report-feb', actor)).rejects.toMatchObject({
        response: { code: 'TAX_REPORT_NOT_APPLICABLE' },
      });
    });
  });
});
