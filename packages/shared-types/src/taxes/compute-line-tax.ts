import type { ComputeLineTaxParams, InvoiceLineTax } from '#taxes/types';

const PERCENT = 100;

/**
 * The PPN inside one invoice line (P27-T04, D-038). Prices are always
 * tax-inclusive, so the line total never changes; the tax is carved out of it:
 *
 *   e = rate × n/d (12% × 11/12 = 11%)
 *   price before PPN = amount ÷ (1 + e)
 *   DPP = price before PPN × n/d
 *   PPN = DPP × rate
 *
 * each rounded to whole rupiah, half up. Rp111,000 of medicine is Rp100,000
 * before PPN, DPP Rp91,667 and PPN Rp11,000. A clinic that is not PKP charges
 * no PPN and an exempt code carries none, but both keep their treatment so a
 * later report still knows what the line was.
 */
export function computeLineTax(params: ComputeLineTaxParams): InvoiceLineTax {
  const { amount, taxCode, rate, isPkp } = params;
  if (taxCode === null) {
    return {
      taxCode: null,
      ppnTreatment: null,
      fakturTransactionCode: null,
      taxableAmount: null,
      taxBase: null,
      taxRatePercent: null,
      taxAmount: 0,
      isResolved: false,
    };
  }
  const snapshot = {
    taxCode: taxCode.code,
    ppnTreatment: taxCode.ppnTreatment,
    fakturTransactionCode: taxCode.fakturTransactionCode,
  };
  const isTaxed = taxCode.ppnTreatment === 'STANDARD';
  if (isTaxed && rate === null) {
    return {
      ...snapshot,
      taxableAmount: null,
      taxBase: null,
      taxRatePercent: null,
      taxAmount: 0,
      isResolved: false,
    };
  }
  if (!isTaxed || !isPkp || rate === null) {
    return {
      ...snapshot,
      taxableAmount: amount,
      taxBase: amount,
      taxRatePercent: 0,
      taxAmount: 0,
      isResolved: true,
    };
  }
  const fraction = rate.dppNumerator / rate.dppDenominator;
  const effectiveRate = (rate.ratePercent / PERCENT) * fraction;
  const taxableAmount = Math.round(amount / (1 + effectiveRate));
  const taxBase = Math.round(taxableAmount * fraction);
  const taxAmount = Math.round((taxBase * rate.ratePercent) / PERCENT);
  return {
    ...snapshot,
    taxableAmount,
    taxBase,
    taxRatePercent: rate.ratePercent,
    taxAmount,
    isResolved: true,
  };
}
