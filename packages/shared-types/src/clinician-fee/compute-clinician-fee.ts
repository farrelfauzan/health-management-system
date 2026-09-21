import type { ClinicianFeeShares, ComputeClinicianFeeParams } from '#clinician-fee/types';

const CENTS_PER_RUPIAH = 100;

const BASIS_POINTS_PER_WHOLE = 10_000;

function toCents(amount: number): number {
  return Math.round(amount * CENTS_PER_RUPIAH);
}

function computeGrossFeeCents(params: ComputeClinicianFeeParams, lineCents: number): number {
  if (params.mode === 'PERCENT') {
    const basisPoints = Math.round(params.value * CENTS_PER_RUPIAH);
    const exactCents = (lineCents * basisPoints) / BASIS_POINTS_PER_WHOLE;
    return Math.round(exactCents / CENTS_PER_RUPIAH) * CENTS_PER_RUPIAH;
  }
  return toCents(params.value) * params.quantity;
}

/**
 * The clinician's and the clinic's share of one paid line (P27-T06), in
 * rupiah. Integer cents throughout, as the billing module does it:
 *
 * - PERCENT: `value`% of the line, rounded half up to a whole rupiah (the unit
 *   PPh 21 is computed in), so 60% of Rp150,000 is Rp90,000.
 * - FIXED: `value` rupiah per unit × quantity.
 *
 * The fee never exceeds the line: a fixed fee above the price gives the
 * clinician the whole line and the clinic nothing, never a negative share.
 */
export function computeClinicianFee(params: ComputeClinicianFeeParams): ClinicianFeeShares {
  const lineCents = toCents(params.lineAmount);
  const grossCents = Math.min(Math.max(computeGrossFeeCents(params, lineCents), 0), lineCents);
  return {
    grossFee: grossCents / CENTS_PER_RUPIAH,
    clinicShare: (lineCents - grossCents) / CENTS_PER_RUPIAH,
  };
}
