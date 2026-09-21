import type { ClinicianFeeRuleModeValue } from '@hms/shared-types';

import { formatRupiah } from '#lib/billing/format-rupiah';

type FormatClinicianFeeRuleValueParams = {
  mode: ClinicianFeeRuleModeValue;
  value: number;
  perUnitLabel: string;
};

/** `60%` for a percentage, `Rp 50.000 / unit` for a fixed fee. */
export function formatClinicianFeeRuleValue({
  mode,
  value,
  perUnitLabel,
}: FormatClinicianFeeRuleValueParams): string {
  return mode === 'PERCENT' ? `${value}%` : `${formatRupiah(value)} ${perUnitLabel}`;
}
