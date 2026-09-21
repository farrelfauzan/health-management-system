import type { ClinicianFeeTotalsView } from '#clinician-fee/contracts';
import type { ClinicianFeeShareAmounts } from '#clinician-fee/types';

const CENTS_PER_RUPIAH = 100;

function toCents(amount: number): number {
  return Math.round(amount * CENTS_PER_RUPIAH);
}

/** Sums ledger amounts in integer cents so odd amounts cannot drift. */
export function sumClinicianFeeTotals(
  entries: readonly ClinicianFeeShareAmounts[],
): ClinicianFeeTotalsView {
  const cents = entries.reduce(
    (sum, entry) => ({
      lineAmount: sum.lineAmount + toCents(entry.lineAmount),
      grossFee: sum.grossFee + toCents(entry.grossFee),
      clinicShare: sum.clinicShare + toCents(entry.clinicShare),
    }),
    { lineAmount: 0, grossFee: 0, clinicShare: 0 },
  );
  return {
    entryCount: entries.length,
    lineAmount: cents.lineAmount / CENTS_PER_RUPIAH,
    grossFee: cents.grossFee / CENTS_PER_RUPIAH,
    clinicShare: cents.clinicShare / CENTS_PER_RUPIAH,
  };
}
