'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaxSettingsView, UpdateTaxSettingsInput } from '@hms/shared-types';
import { Button, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { TaxIncomeRegimeFields } from '#components/client/taxes/tax-income-regime-fields';
import { TaxPpnFields } from '#components/client/taxes/tax-ppn-fields';
import {
  getTaxSettingsControllerGetTaxSettingsV1QueryKey,
  taxSettingsControllerUpdateTaxSettingsV1,
} from '#lib/api/generated/tax-settings/tax-settings';
import { notifyApiError } from '#lib/api/notify-api-error';
import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import { resolveApiFieldErrors } from '#lib/api/resolve-api-field-errors';
import { parseApiSuccess } from '#lib/api/response';
import { TAX_SETTINGS_ERROR_CODES } from '#lib/taxes/tax-settings-error-codes';
import type { TaxSettingsFormValues } from '#lib/taxes/tax-settings-form-values';
import { toTaxSettingsFormValues } from '#lib/taxes/to-tax-settings-form-values';
import { toUpdateTaxSettingsInput } from '#lib/taxes/to-update-tax-settings-input';

const FORM_FIELDS: ReadonlyArray<keyof TaxSettingsFormValues> = [
  'taxpayerType',
  'incomeTaxRegime',
  'pp55StartYear',
  'isPkp',
  'pkpSince',
  'nitku',
];

type TaxSettingsFormProps = {
  settings: TaxSettingsView;
  canWrite: boolean;
};

/**
 * The editable half of the tax profile (P27-T02). Sends only what changed, and
 * explains the three refusals the API judges on the merged row — PP 55
 * eligibility, the PKP date, the NITKU prefix — in the reader's language.
 */
export function TaxSettingsForm({ settings, canWrite }: TaxSettingsFormProps) {
  const t = useTranslations('operations.taxes.settings');
  const queryClient = useQueryClient();
  const [values, setValues] = useState<TaxSettingsFormValues>(() =>
    toTaxSettingsFormValues(settings),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // The server's answer is the starting position; resync when it changes.
  useEffect(() => {
    setValues(toTaxSettingsFormValues(settings));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (payload: UpdateTaxSettingsInput) =>
      taxSettingsControllerUpdateTaxSettingsV1(payload),
  });
  const payload = toUpdateTaxSettingsInput({ values, initial: toTaxSettingsFormValues(settings) });
  const isDirty = Object.keys(payload).length > 0;
  const isDisabled = !canWrite || saveMutation.isPending;

  function handleChange(change: Partial<TaxSettingsFormValues>): void {
    setFormError(null);
    setFieldErrors((current) => omitKeys(current, Object.keys(change)));
    setValues((current) => ({ ...current, ...change }));
  }

  async function handleSave(): Promise<void> {
    try {
      const response = await saveMutation.mutateAsync(payload);
      parseApiSuccess<TaxSettingsView>(response, t('saveError'));
      await queryClient.invalidateQueries({
        queryKey: getTaxSettingsControllerGetTaxSettingsV1QueryKey(),
      });
      toast.success(t('saved'));
    } catch (caughtError) {
      handleSaveError(caughtError);
    }
  }

  /**
   * Refusals land under the input that caused them. The API names the field —
   * in the validation pipe's issue list, or in the map a service throws — so a
   * wrong NITKU is answered beside the NITKU box rather than by a toast that
   * says only that something failed. A refusal this form has its own wording
   * for replaces the API's English text; one that names no field, or none this
   * form renders, stays a notice above the fields.
   */
  function handleSaveError(caughtError: unknown): void {
    const code = resolveApiErrorCode(caughtError);
    const knownCode = TAX_SETTINGS_ERROR_CODES.find((candidate) => candidate === code);
    const apiFieldErrors = resolveApiFieldErrors(caughtError);
    const fields = Object.keys(apiFieldErrors).filter(isFormField);
    if (fields.length === 0) {
      setFieldErrors({});
      if (knownCode) {
        setFormError(t(`errors.${knownCode}`));
        return;
      }
      notifyApiError(caughtError, t('saveError'));
      return;
    }
    // One known refusal is said in the reader's language under its own field;
    // anything else keeps the API's wording, which names the rule.
    const ownWording = knownCode && fields.length === 1 ? t(`errors.${knownCode}`) : undefined;
    setFieldErrors(
      Object.fromEntries(fields.map((field) => [field, ownWording ?? apiFieldErrors[field] ?? ''])),
    );
    setFormError(knownCode && fields.length > 1 ? t(`errors.${knownCode}`) : null);
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
      <TaxIncomeRegimeFields
        values={values}
        errors={fieldErrors}
        disabled={isDisabled}
        onChange={handleChange}
      />
      <TaxPpnFields
        values={values}
        errors={fieldErrors}
        disabled={isDisabled}
        onChange={handleChange}
      />
      {canWrite ? (
        <Button
          type="submit"
          className="bg-primary-container hover:bg-primary"
          disabled={!isDirty || saveMutation.isPending}
        >
          {t('save')}
        </Button>
      ) : null}
    </form>
  );
}

/** The form's own fields; anything else the API names is not ours to show. */
function isFormField(field: string): field is keyof TaxSettingsFormValues {
  return FORM_FIELDS.includes(field as keyof TaxSettingsFormValues);
}

function omitKeys(errors: Record<string, string>, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).filter(([field]) => !keys.includes(field)));
}
