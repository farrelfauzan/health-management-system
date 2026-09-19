import {
  PpnOutputReportSummary,
  PpnOutputSourceLine,
  computePp55MonthlyTax,
  diffTaxReportTotals,
  resolveTaxReportDueDates,
  summarizePpnOutput,
} from '@hms/shared-types';

/** P27-T05: the pure rules behind the monthly drafts. */
describe('monthly tax report rules', () => {
  describe('computePp55MonthlyTax', () => {
    it('taxes an individual only above the Rp500 juta yearly line, the ticket example', () => {
      const january = computePp55MonthlyTax({
        monthOmzet: 300_000_000,
        yearToDateOmzetBefore: 0,
        taxpayerType: 'INDIVIDUAL',
      });
      const february = computePp55MonthlyTax({
        monthOmzet: 400_000_000,
        yearToDateOmzetBefore: 300_000_000,
        taxpayerType: 'INDIVIDUAL',
      });

      expect(january).toEqual({ nonTaxableAllowanceUsed: 300_000_000, taxableOmzet: 0, taxDue: 0 });
      expect(february).toEqual({
        nonTaxableAllowanceUsed: 200_000_000,
        taxableOmzet: 200_000_000,
        taxDue: 1_000_000,
      });
    });

    it('gives a PT perorangan no allowance: it is a badan, not an orang pribadi', () => {
      const actual = computePp55MonthlyTax({
        monthOmzet: 100_000_000,
        yearToDateOmzetBefore: 0,
        taxpayerType: 'PT_PERORANGAN',
      });

      expect(actual).toEqual({
        nonTaxableAllowanceUsed: 0,
        taxableOmzet: 100_000_000,
        taxDue: 500_000,
      });
    });
  });

  describe('resolveTaxReportDueDates', () => {
    it('puts PPh final on the 15th and PPN at the end of the next month, across a year end', () => {
      expect(resolveTaxReportDueDates('2026-12', 'PP55_OMZET')).toEqual({
        paymentDueDate: '2027-01-15',
        reportingDueDate: '2027-01-15',
      });
      expect(resolveTaxReportDueDates('2027-01', 'PPN_OUTPUT')).toEqual({
        paymentDueDate: '2027-02-28',
        reportingDueDate: '2027-02-28',
      });
    });
  });

  describe('summarizePpnOutput', () => {
    function buildLine(overrides: Partial<PpnOutputSourceLine>): PpnOutputSourceLine {
      return {
        invoiceId: 'inv-1',
        invoiceNumber: 'INV/20260903/0001',
        issuedAt: new Date('2026-09-03T03:00:00.000Z'),
        taxCode: 'BARANG-PPN',
        ppnTreatment: 'STANDARD',
        fakturTransactionCode: '04',
        amount: 111_000,
        taxableAmount: 100_000,
        taxBase: 91_667,
        taxAmount: 11_000,
        ...overrides,
      };
    }

    it('groups by faktur code and keeps legacy lines out of the totals', () => {
      const actual = summarizePpnOutput({
        dueDates: { paymentDueDate: '2026-10-31', reportingDueDate: '2026-10-31' },
        lines: [
          buildLine({}),
          buildLine({
            taxCode: 'JASA-MEDIS',
            ppnTreatment: 'EXEMPT_MEDICAL',
            fakturTransactionCode: '08',
            amount: 50_000,
            taxableAmount: 50_000,
            taxBase: 50_000,
            taxAmount: 0,
          }),
          buildLine({
            invoiceId: 'inv-old',
            invoiceNumber: 'INV/20260901/0009',
            taxCode: null,
            ppnTreatment: null,
            fakturTransactionCode: null,
            amount: 75_000,
            taxableAmount: null,
            taxBase: null,
            taxAmount: 0,
          }),
        ],
      });

      expect(
        actual.summary.groups.map((group) => [group.fakturTransactionCode, group.taxAmount]),
      ).toEqual([
        ['04', 11_000],
        ['08', 0],
      ]);
      expect(actual.summary.totals).toEqual({
        taxableAmount: 150_000,
        taxBase: 141_667,
        taxAmount: 11_000,
      });
      expect(actual.summary).toMatchObject({
        invoiceCount: 2,
        legacyLineCount: 1,
        legacyAmount: 75_000,
      });
    });
  });

  describe('diffTaxReportTotals', () => {
    function buildSummary(taxAmount: number): PpnOutputReportSummary {
      return {
        kind: 'PPN_OUTPUT',
        invoiceCount: 1,
        groups: [],
        legacyLineCount: 0,
        legacyAmount: 0,
        notObjectLineCount: 0,
        notObjectAmount: 0,
        totals: { taxableAmount: 100_000, taxBase: 91_667, taxAmount },
        paymentDueDate: '2026-10-31',
        reportingDueDate: '2026-10-31',
      };
    }

    it('names each total that no longer matches, and nothing when they agree', () => {
      expect(diffTaxReportTotals(buildSummary(11_000), buildSummary(0))).toEqual([
        { field: 'taxAmount', stored: 11_000, live: 0 },
      ]);
      expect(diffTaxReportTotals(buildSummary(11_000), buildSummary(11_000))).toEqual([]);
    });
  });
});
