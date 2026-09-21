import {
  PKP_TURNOVER_THRESHOLD_RUPIAH,
  resolveAnnualTaxReturnDueDate,
  resolveCrossedTurnoverFractions,
  resolveTaxObligationDueDates,
  resolveTaxReportDueDates,
} from '@hms/shared-types';

/**
 * P27-T10. The dates themselves are PMK 81/2024; what these tests pin is that
 * the calendar emits an obligation only when the clinic actually has it, and
 * that it never invents a second opinion about a date P27-T05 already owns.
 */
describe('the tax calendar (P27-T10)', () => {
  describe('resolveTaxObligationDueDates', () => {
    it('agrees with the report screen about when a report is due', () => {
      const actual = resolveTaxObligationDueDates({
        period: '2026-10',
        incomeTaxRegime: 'PP55',
        isPkp: true,
      });

      // Not a second copy of the rule: the same function the report reads.
      expect(actual.find((due) => due.obligation === 'PP55_INCOME_TAX_DEPOSIT')?.dueDate).toBe(
        resolveTaxReportDueDates('2026-10', 'PP55_OMZET').paymentDueDate,
      );
      expect(actual.find((due) => due.obligation === 'PPN_DEPOSIT_AND_RETURN')?.dueDate).toBe(
        resolveTaxReportDueDates('2026-10', 'PPN_OUTPUT').reportingDueDate,
      );
    });

    it('puts October income tax on 15 November and the withholding returns on the 20th', () => {
      const actual = resolveTaxObligationDueDates({
        period: '2026-10',
        incomeTaxRegime: 'PP55',
        isPkp: false,
      });

      expect(actual).toEqual([
        {
          obligation: 'PP55_INCOME_TAX_DEPOSIT',
          dueDate: '2026-11-15',
          reportKind: 'PP55_OMZET',
        },
        {
          obligation: 'WITHHOLDING_RETURN_PPH_21_26',
          dueDate: '2026-11-20',
          reportKind: null,
        },
        {
          obligation: 'WITHHOLDING_RETURN_UNIFICATION',
          dueDate: '2026-11-20',
          reportKind: null,
        },
      ]);
    });

    it('rolls December into the following year', () => {
      const actual = resolveTaxObligationDueDates({
        period: '2026-12',
        incomeTaxRegime: 'PP55',
        isPkp: true,
      });

      expect(actual[0]?.dueDate).toBe('2027-01-15');
      expect(actual[1]?.dueDate).toBe('2027-01-31');
    });

    it('tells a non-PKP clinic nothing about PPN, and a general-regime one nothing about PP 55', () => {
      const actual = resolveTaxObligationDueDates({
        period: '2026-10',
        incomeTaxRegime: 'GENERAL',
        isPkp: false,
      });

      // A clinic on the general regime pays income tax differently, and one
      // that is not a PKP never charges PPN (D-038). Either reminder would be
      // telling it to do the wrong thing.
      expect(actual.map((due) => due.obligation)).toEqual([
        'WITHHOLDING_RETURN_PPH_21_26',
        'WITHHOLDING_RETURN_UNIFICATION',
      ]);
    });

    it('refuses a period that is not YYYY-MM rather than inventing a date', () => {
      expect(() =>
        resolveTaxObligationDueDates({ period: '2026', incomeTaxRegime: 'PP55', isPkp: false }),
      ).toThrow('Tax period must be YYYY-MM');
    });
  });

  describe('resolveAnnualTaxReturnDueDate', () => {
    it('gives an individual end of March and an entity end of April, of the following year', () => {
      expect(resolveAnnualTaxReturnDueDate({ taxYear: 2026, taxpayerType: 'INDIVIDUAL' })).toEqual({
        obligation: 'ANNUAL_RETURN_INDIVIDUAL',
        dueDate: '2027-03-31',
        reportKind: null,
      });
      expect(resolveAnnualTaxReturnDueDate({ taxYear: 2026, taxpayerType: 'ENTITY' })).toEqual({
        obligation: 'ANNUAL_RETURN_ENTITY',
        dueDate: '2027-04-30',
        reportKind: null,
      });
    });
  });

  describe('resolveCrossedTurnoverFractions', () => {
    it('raises the 80% mark the ticket names, at Rp 3.84 bn', () => {
      expect(resolveCrossedTurnoverFractions(3_840_000_000)).toEqual([0.8]);
      expect(resolveCrossedTurnoverFractions(3_839_999_999)).toEqual([]);
    });

    it('raises both marks when the figure jumped past both between sweeps', () => {
      // The 80% notice is the one that says "prepare". Skipping it because the
      // number moved fast would be exactly backwards.
      expect(resolveCrossedTurnoverFractions(PKP_TURNOVER_THRESHOLD_RUPIAH)).toEqual([0.8, 1]);
    });
  });
});
