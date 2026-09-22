import {
  Pph21TaxBracketRecord,
  computePph21NonEmployee,
  resolveClinicianTaxIdentity,
  resolvePph21BracketSet,
  resolveTaxObligationDueDates,
  resolveTaxReportDueDates,
  summarizePph21Withholding,
} from '@hms/shared-types';

const HPP_BRACKETS: Pph21TaxBracketRecord[] = [
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

/** P27-T07: the pure rules behind the PPh 21 bukan pegawai draft. */
describe('PPh 21 non-employee rules', () => {
  describe('computePph21NonEmployee', () => {
    it('taxes dr. A on Rp20 juta gross: DPP Rp10 juta, PPh 21 Rp500.000 (the ticket example)', () => {
      const actual = computePph21NonEmployee({ grossFee: 20_000_000, brackets: HPP_BRACKETS });

      expect(actual.taxBase).toBe(10_000_000);
      expect(actual.taxAmount).toBe(500_000);
      expect(actual.slices).toEqual([
        {
          lowerBound: 0,
          upperBound: 60_000_000,
          ratePercent: 5,
          taxableAmount: 10_000_000,
          taxAmount: 500_000,
        },
      ]);
    });

    it.each([
      // A base exactly on a boundary stays wholly in the lower bracket.
      [120_000_000, 60_000_000, 3_000_000],
      [120_000_002, 60_000_001, 3_000_000],
      [500_000_000, 250_000_000, 3_000_000 + 28_500_000],
      [1_000_000_000, 500_000_000, 3_000_000 + 28_500_000 + 62_500_000],
      [10_000_000_000, 5_000_000_000, 3_000_000 + 28_500_000 + 62_500_000 + 1_350_000_000],
      [10_000_000_002, 5_000_000_001, 3_000_000 + 28_500_000 + 62_500_000 + 1_350_000_000],
    ])('gross %i: DPP %i, PPh 21 %i at the bracket boundaries', (grossFee, taxBase, taxAmount) => {
      const actual = computePph21NonEmployee({ grossFee, brackets: HPP_BRACKETS });

      expect(actual.taxBase).toBe(taxBase);
      expect(actual.taxAmount).toBe(taxAmount);
    });

    it('is non-cumulative: two months of Rp100 juta each are taxed as two separate Rp50 juta bases', () => {
      const october = computePph21NonEmployee({ grossFee: 100_000_000, brackets: HPP_BRACKETS });
      const november = computePph21NonEmployee({ grossFee: 100_000_000, brackets: HPP_BRACKETS });

      // PMK 168/2023 Pasal 5(1)(e): each period stands alone, so the second
      // month never climbs into the 15% bracket the year total would reach.
      expect(october.taxAmount).toBe(2_500_000);
      expect(november.taxAmount).toBe(2_500_000);
    });

    it('taxes nothing on a month whose reversals outweigh its accruals', () => {
      const actual = computePph21NonEmployee({ grossFee: -90_000, brackets: HPP_BRACKETS });

      expect(actual).toMatchObject({ taxBase: 0, taxAmount: 0, slices: [] });
    });
  });

  describe('resolvePph21BracketSet', () => {
    const futureSet: Pph21TaxBracketRecord[] = [
      {
        id: 'f1',
        effectiveFrom: '2027-01-01',
        lowerBound: 0,
        upperBound: 100_000_000,
        ratePercent: 4,
      },
      {
        id: 'f2',
        effectiveFrom: '2027-01-01',
        lowerBound: 100_000_000,
        upperBound: null,
        ratePercent: 20,
      },
    ];

    it('ignores a bracket set with a future effectiveFrom for an earlier period', () => {
      const actual = resolvePph21BracketSet({
        brackets: [...HPP_BRACKETS, ...futureSet],
        onDate: '2026-10-01',
      });

      expect(actual.effectiveFrom).toBe('2022-01-01');
      expect(actual.brackets).toHaveLength(HPP_BRACKETS.length);
      expect(actual.brackets.map((bracket) => bracket.ratePercent)).toEqual([5, 15, 25, 30, 35]);
    });

    it('takes the later set once its date has arrived, and only that set', () => {
      const actual = resolvePph21BracketSet({
        brackets: [...futureSet, ...HPP_BRACKETS],
        onDate: '2027-01-01',
      });

      expect(actual.effectiveFrom).toBe('2027-01-01');
      expect(actual.brackets.map((bracket) => bracket.id)).toEqual(['f1', 'f2']);
    });

    it('reports no set when none has started', () => {
      expect(resolvePph21BracketSet({ brackets: futureSet, onDate: '2026-10-01' })).toEqual({
        effectiveFrom: null,
        brackets: [],
      });
    });
  });

  describe('resolveClinicianTaxIdentity', () => {
    it('prefers the NPWP, falls back to the masked NIK, and flags a clinician with neither', () => {
      expect(resolveClinicianTaxIdentity({ npwp: '0123456789012345', nikLast4: '0001' })).toEqual({
        status: 'NPWP',
        masked: '0123456789012345',
      });
      expect(resolveClinicianTaxIdentity({ npwp: null, nikLast4: '0001' })).toEqual({
        status: 'NIK',
        masked: '••••••••0001',
      });
      expect(resolveClinicianTaxIdentity({ npwp: null, nikLast4: null })).toEqual({
        status: 'MISSING',
        masked: null,
      });
    });
  });

  describe('summarizePph21Withholding', () => {
    it('keeps a clinician without NIK or NPWP on the draft, flagged, and counts them', () => {
      const actual = summarizePph21Withholding({
        fees: [
          { doctorId: 'dr-a', entryCount: 40, lineAmount: 33_333_333, grossFee: 20_000_000 },
          { doctorId: 'bd-b', entryCount: 3, lineAmount: 500_000, grossFee: 300_000 },
        ],
        identities: [
          {
            doctorId: 'dr-a',
            fullName: 'Andi',
            profession: 'DOCTOR',
            npwp: null,
            nikLast4: '0001',
          },
          {
            doctorId: 'bd-b',
            fullName: 'Bunga',
            profession: 'MIDWIFE',
            npwp: null,
            nikLast4: null,
          },
        ],
        bracketSet: { effectiveFrom: '2022-01-01', brackets: HPP_BRACKETS },
        dueDates: { paymentDueDate: '2026-11-15', reportingDueDate: '2026-11-20' },
      });

      expect(actual.summary).toMatchObject({
        kind: 'PPH21_NON_EMPLOYEE',
        clinicianCount: 2,
        incompleteIdentityCount: 1,
        totals: { grossFee: 20_300_000, taxBase: 10_150_000, taxAmount: 507_500 },
        taxAccountCode: '411121',
        depositTypeCode: '100',
      });
      expect(actual.lines.map((line) => [line.doctorName, line.identityStatus])).toEqual([
        ['Andi', 'NIK'],
        ['Bunga', 'MISSING'],
      ]);
    });
  });

  describe('due dates', () => {
    it('deposits PPh 21 by the 15th and files the SPT Masa by the 20th of the next month', () => {
      expect(resolveTaxReportDueDates('2026-10', 'PPH21_NON_EMPLOYEE')).toEqual({
        paymentDueDate: '2026-11-15',
        reportingDueDate: '2026-11-20',
      });
      expect(resolveTaxReportDueDates('2026-12', 'PPH21_NON_EMPLOYEE')).toEqual({
        paymentDueDate: '2027-01-15',
        reportingDueDate: '2027-01-20',
      });
    });

    it('gates the PPh 21 dates on the draft only for a clinic that withheld in the period', () => {
      const withFees = resolveTaxObligationDueDates({
        period: '2026-10',
        incomeTaxRegime: 'GENERAL',
        isPkp: false,
        hasWithholding: true,
      });
      const without = resolveTaxObligationDueDates({
        period: '2026-10',
        incomeTaxRegime: 'GENERAL',
        isPkp: false,
        hasWithholding: false,
      });

      expect(withFees).toEqual([
        {
          obligation: 'PPH21_WITHHOLDING_DEPOSIT',
          dueDate: '2026-11-15',
          reportKind: 'PPH21_NON_EMPLOYEE',
        },
        {
          obligation: 'WITHHOLDING_RETURN_PPH_21_26',
          dueDate: '2026-11-20',
          reportKind: 'PPH21_NON_EMPLOYEE',
        },
        { obligation: 'WITHHOLDING_RETURN_UNIFICATION', dueDate: '2026-11-20', reportKind: null },
      ]);
      expect(without.map((due) => [due.obligation, due.reportKind])).toEqual([
        ['WITHHOLDING_RETURN_PPH_21_26', null],
        ['WITHHOLDING_RETURN_UNIFICATION', null],
      ]);
    });
  });
});
