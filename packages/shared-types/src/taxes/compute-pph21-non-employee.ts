import { PPH21_NON_EMPLOYEE_DPP_PERCENT } from '#taxes/schemas';
import type {
  ComputePph21NonEmployeeParams,
  Pph21BracketSlice,
  Pph21NonEmployeeTax,
  Pph21TaxBracketRecord,
} from '#taxes/types';

const PERCENT = 100;

/**
 * PPh 21 on a non-employee clinician's fees for one period (P27-T07;
 * PMK 168/2023 Pasal 5(1)(e), UU PPh Pasal 17(1)(a)). The taxable base is 50%
 * of the gross fee, taxed progressively through the bracket set handed in.
 * Non-cumulative: the base is this period's alone, never the year to date. A
 * negative gross (reversals outweighing accruals) taxes nothing. Whole
 * rupiah at every step.
 */
export function computePph21NonEmployee(
  params: ComputePph21NonEmployeeParams,
): Pph21NonEmployeeTax {
  const grossFee = params.grossFee;
  const taxBase = Math.max(0, Math.round((grossFee * PPH21_NON_EMPLOYEE_DPP_PERCENT) / PERCENT));
  const slices = [...params.brackets]
    .sort((left, right) => left.lowerBound - right.lowerBound)
    .map((bracket) => toSlice(bracket, taxBase))
    .filter((slice) => slice.taxableAmount > 0);
  return {
    grossFee,
    dppPercent: PPH21_NON_EMPLOYEE_DPP_PERCENT,
    taxBase,
    slices,
    taxAmount: slices.reduce((total, slice) => total + slice.taxAmount, 0),
  };
}

function toSlice(bracket: Pph21TaxBracketRecord, taxBase: number): Pph21BracketSlice {
  const ceiling = bracket.upperBound ?? Number.POSITIVE_INFINITY;
  const taxableAmount = Math.max(0, Math.min(taxBase, ceiling) - bracket.lowerBound);
  return {
    lowerBound: bracket.lowerBound,
    upperBound: bracket.upperBound,
    ratePercent: bracket.ratePercent,
    taxableAmount,
    taxAmount: Math.round((taxableAmount * bracket.ratePercent) / PERCENT),
  };
}
