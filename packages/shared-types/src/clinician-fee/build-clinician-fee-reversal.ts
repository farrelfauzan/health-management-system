import type {
  BuildClinicianFeeReversalParams,
  CreateClinicianFeeEntryPayload,
} from '#clinician-fee/types';

function negate(amount: number): number {
  return amount === 0 ? 0 : -amount;
}

/**
 * The REVERSAL of one accrual (P27-T06): the same line, clinician and rule
 * snapshot with every amount negated, dated in the month of the void — the
 * payment month's statement is never rewritten.
 */
export function buildClinicianFeeReversal(
  params: BuildClinicianFeeReversalParams,
): CreateClinicianFeeEntryPayload {
  const { accrual } = params;
  return {
    kind: 'REVERSAL',
    invoiceId: params.invoiceId,
    invoiceItemId: accrual.invoiceItemId,
    doctorId: accrual.doctorId,
    ruleId: accrual.ruleId,
    ruleMode: accrual.ruleMode,
    ruleValue: accrual.ruleValue,
    lineAmount: negate(accrual.lineAmount),
    grossFee: negate(accrual.grossFee),
    clinicShare: negate(accrual.clinicShare),
    period: params.period,
    occurredAt: params.occurredAt,
  };
}
