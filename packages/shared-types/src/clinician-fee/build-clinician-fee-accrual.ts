import type { InvoiceItemTypeValue, ServiceTariffCategoryValue } from '#billing/schemas';
import { computeClinicianFee } from '#clinician-fee/compute-clinician-fee';
import { resolveClinicianFeeRule } from '#clinician-fee/resolve-clinician-fee-rule';
import type {
  BuildClinicianFeeAccrualParams,
  ClinicianFeeLineRecord,
  CreateClinicianFeeEntryPayload,
} from '#clinician-fee/types';

/**
 * A line with no tariff is matched by its item type, which shares the category
 * names. A medication line has no category: medicine is not a clinician's
 * service, and only a tariff-level rule could ever price it.
 */
const CATEGORY_BY_ITEM_TYPE: Readonly<
  Record<InvoiceItemTypeValue, ServiceTariffCategoryValue | null>
> = {
  CONSULTATION: 'CONSULTATION',
  PROCEDURE: 'PROCEDURE',
  MEDICATION: null,
  ACCOMMODATION: 'ACCOMMODATION',
  LAB: 'LAB',
  OTHER: 'OTHER',
};

function resolveLineCategory(line: ClinicianFeeLineRecord): ServiceTariffCategoryValue | null {
  return line.tariffCategory ?? CATEGORY_BY_ITEM_TYPE[line.itemType];
}

/**
 * The ACCRUAL entry for one paid line (P27-T06), or `null` when no rule in
 * force on the payment day prices it for this clinician.
 */
export function buildClinicianFeeAccrual(
  params: BuildClinicianFeeAccrualParams,
): CreateClinicianFeeEntryPayload | null {
  const { line } = params;
  const resolved = resolveClinicianFeeRule({
    rules: params.rules,
    doctorId: params.doctorId,
    serviceTariffId: line.serviceTariffId,
    category: resolveLineCategory(line),
    onDate: params.onDate,
  });
  if (resolved === null) {
    return null;
  }
  const shares = computeClinicianFee({
    lineAmount: line.amount,
    quantity: line.quantity,
    mode: resolved.rule.mode,
    value: resolved.rule.value,
  });
  return {
    kind: 'ACCRUAL',
    invoiceId: params.invoiceId,
    invoiceItemId: line.invoiceItemId,
    doctorId: params.doctorId,
    ruleId: resolved.rule.id,
    ruleMode: resolved.rule.mode,
    ruleValue: resolved.rule.value,
    lineAmount: line.amount,
    grossFee: shares.grossFee,
    clinicShare: shares.clinicShare,
    period: params.period,
    occurredAt: params.occurredAt,
  };
}
