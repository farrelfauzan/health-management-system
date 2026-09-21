'use client';

import { CLINICIAN_FEE_RULE_MODES, type ClinicianFeeRuleModeValue } from '@hms/shared-types';
import {
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import type { ClinicianFeeRuleFormValues } from '#lib/clinician-fees/clinician-fee-rule-form-values';

type ClinicianFeeRuleTermsFieldsProps = {
  values: ClinicianFeeRuleFormValues;
  disabled: boolean;
  onChange: (change: Partial<ClinicianFeeRuleFormValues>) => void;
};

/** The share and the days it is in force (P27-T06), both ends inclusive. */
export function ClinicianFeeRuleTermsFields({
  values,
  disabled,
  onChange,
}: ClinicianFeeRuleTermsFieldsProps) {
  const t = useTranslations('operations.billing.fees.form');

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <FormLabel htmlFor="clinician-fee-mode" required>
          {t('mode')}
        </FormLabel>
        <Select
          value={values.mode}
          disabled={disabled}
          onValueChange={(value) => onChange({ mode: value as ClinicianFeeRuleModeValue })}
        >
          <SelectTrigger id="clinician-fee-mode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLINICIAN_FEE_RULE_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {t(`modes.${mode}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <FormLabel htmlFor="clinician-fee-value" required>
          {values.mode === 'PERCENT' ? t('valuePercent') : t('valueFixed')}
        </FormLabel>
        <Input
          id="clinician-fee-value"
          inputMode="decimal"
          value={values.value}
          disabled={disabled}
          onChange={(event) => onChange({ value: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <FormLabel htmlFor="clinician-fee-from" required>
          {t('effectiveFrom')}
        </FormLabel>
        <DatePicker
          id="clinician-fee-from"
          value={values.effectiveFrom}
          disabled={disabled}
          onValueChange={(value) => onChange({ effectiveFrom: value })}
        />
      </div>
      <div className="space-y-1">
        <FormLabel htmlFor="clinician-fee-to">{t('effectiveTo')}</FormLabel>
        <DatePicker
          id="clinician-fee-to"
          value={values.effectiveTo}
          disabled={disabled}
          onValueChange={(value) => onChange({ effectiveTo: value })}
        />
      </div>
    </div>
  );
}
