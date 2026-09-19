import {
  TaxCodeRateRecord,
  isFakturCodeAllowed,
  resolveEffectiveTaxCode,
  resolveTaxRate,
  toTaxDefaultTarget,
} from '@hms/shared-types';

function buildRate(effectiveFrom: string, ratePercent = 12): TaxCodeRateRecord {
  return { id: effectiveFrom, ratePercent, dppNumerator: 11, dppDenominator: 12, effectiveFrom };
}

/** P27-T03: the pure rules the tax code screens and invoice generation share. */
describe('tax code resolution', () => {
  describe('resolveEffectiveTaxCode', () => {
    it('prefers the item override, then the category default, then reports unresolved', () => {
      expect(resolveEffectiveTaxCode({ overrideTaxCodeId: 'a', defaultTaxCodeId: 'b' })).toEqual({
        source: 'OVERRIDE',
        taxCodeId: 'a',
      });
      expect(resolveEffectiveTaxCode({ overrideTaxCodeId: null, defaultTaxCodeId: 'b' })).toEqual({
        source: 'CATEGORY_DEFAULT',
        taxCodeId: 'b',
      });
      expect(resolveEffectiveTaxCode({ overrideTaxCodeId: null, defaultTaxCodeId: null })).toEqual({
        source: 'UNRESOLVED',
        taxCodeId: null,
      });
    });
  });

  describe('resolveTaxRate', () => {
    const rates = [buildRate('2025-01-01'), buildRate('2027-01-01', 13)];

    it('keeps the old rate for a day before a new one starts, the ticket example', () => {
      expect(resolveTaxRate({ rates, onDate: '2026-12-31' })?.ratePercent).toBe(12);
      expect(resolveTaxRate({ rates, onDate: '2027-01-01' })?.ratePercent).toBe(13);
    });

    it('has no rate before the first one', () => {
      expect(resolveTaxRate({ rates, onDate: '2024-12-31' })).toBeNull();
    });
  });

  describe('toTaxDefaultTarget', () => {
    it('maps a tariff by its category and every medication to one target', () => {
      expect(toTaxDefaultTarget('SERVICE_TARIFF', 'LAB')).toBe('LAB');
      expect(toTaxDefaultTarget('SERVICE_TARIFF', 'SOMETHING_NEW')).toBe('OTHER');
      expect(toTaxDefaultTarget('MEDICATION', 'OBAT_KERAS')).toBe('MEDICATION');
    });
  });

  describe('isFakturCodeAllowed', () => {
    it('matches the faktur code to the treatment', () => {
      expect(
        isFakturCodeAllowed({ ppnTreatment: 'EXEMPT_MEDICAL', fakturTransactionCode: '08' }),
      ).toBe(true);
      expect(isFakturCodeAllowed({ ppnTreatment: 'STANDARD', fakturTransactionCode: '08' })).toBe(
        false,
      );
      expect(isFakturCodeAllowed({ ppnTreatment: 'STANDARD', fakturTransactionCode: '01' })).toBe(
        true,
      );
      expect(isFakturCodeAllowed({ ppnTreatment: 'NOT_OBJECT', fakturTransactionCode: null })).toBe(
        true,
      );
    });
  });
});
