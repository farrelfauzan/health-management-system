'use client';

import { Checkbox, DatePicker, Input, Label } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FieldDescription } from '#components/client/shared/field-description';
import { FieldError } from '#components/client/shared/field-error';
import { toFieldErrors } from '#lib/forms/to-field-errors';
import { FormLabel } from '#components/client/shared/form-label';
import type { TaxSettingsFormValues } from '#lib/taxes/tax-settings-form-values';

type TaxPpnFieldsProps = {
  values: TaxSettingsFormValues;
  /** Refusals the API named per field, shown under the input that caused them. */
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (change: Partial<TaxSettingsFormValues>) => void;
};

const FIELD_ID_PREFIX = 'tax-ppn';

/**
 * PKP status and NITKU (P27-T02). A clinic that is not PKP never charges PPN
 * (D-038), which the PKP description says in so many words. Prices are always
 * tax-inclusive (P27-T04), so there is no pricing-mode switch — only a line
 * saying so.
 */
export function TaxPpnFields({ values, errors, disabled, onChange }: TaxPpnFieldsProps) {
  const t = useTranslations('operations.taxes.settings');

  return (
    <fieldset className="space-y-4">
      <legend className="font-heading text-sm font-semibold text-slate-900">
        {t('ppn.title')}
      </legend>
      <div className="space-y-1.5 rounded-lg border border-slate-200 p-3">
        <Label className="flex cursor-pointer items-start gap-2.5 font-normal">
          <Checkbox
            checked={values.isPkp}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ isPkp: checked === true })}
            className="mt-0.5"
          />
          <span className="text-sm font-medium text-slate-900">{t('ppn.isPkp')}</span>
        </Label>
        <p className="pl-7 text-xs text-slate-500">
          {values.isPkp ? t('ppn.isPkpOn') : t('ppn.isPkpOff')}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {values.isPkp ? (
          <div className="space-y-1.5">
            <FormLabel
              htmlFor={`${FIELD_ID_PREFIX}-pkp-since`}
              className="font-heading text-xs text-slate-600"
              required
            >
              {t('ppn.pkpSince')}
            </FormLabel>
            <DatePicker
              id={`${FIELD_ID_PREFIX}-pkp-since`}
              value={values.pkpSince}
              disabled={disabled}
              aria-invalid={errors.pkpSince !== undefined}
              onValueChange={(value) => onChange({ pkpSince: value })}
            />
            <FieldError errors={toFieldErrors(errors.pkpSince)} />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <FormLabel
            htmlFor={`${FIELD_ID_PREFIX}-nitku`}
            className="font-heading text-xs text-slate-600"
          >
            {t('ppn.nitku')}
          </FormLabel>
          <Input
            id={`${FIELD_ID_PREFIX}-nitku`}
            inputMode="numeric"
            className="font-mono"
            value={values.nitku}
            disabled={disabled}
            aria-describedby={`${FIELD_ID_PREFIX}-nitku-hint`}
            aria-invalid={errors.nitku !== undefined}
            onChange={(event) => onChange({ nitku: event.target.value })}
          />
          <FieldError errors={toFieldErrors(errors.nitku)} />
          <FieldDescription id={`${FIELD_ID_PREFIX}-nitku-hint`}>
            {t('ppn.nitkuHint')}
          </FieldDescription>
        </div>
      </div>
      <p className="text-xs text-slate-500">{t('ppn.pricesIncludeTaxNote')}</p>
    </fieldset>
  );
}
