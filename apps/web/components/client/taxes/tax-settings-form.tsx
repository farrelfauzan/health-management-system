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
import { parseApiSuccess } from '#lib/api/response';
import { TAX_SETTINGS_ERROR_CODES } from '#lib/taxes/tax-settings-error-codes';
import type { TaxSettingsFormValues } from '#lib/taxes/tax-settings-form-values';
import { toTaxSettingsFormValues } from '#lib/taxes/to-tax-settings-form-values';
import { toUpdateTaxSettingsInput } from '#lib/taxes/to-update-tax-settings-input';

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

  function handleSaveError(caughtError: unknown): void {
    const code = resolveApiErrorCode(caughtError);
    const knownCode = TAX_SETTINGS_ERROR_CODES.find((candidate) => candidate === code);
    if (knownCode) {
      setFormError(t(`errors.${knownCode}`));
      return;
    }
    notifyApiError(caughtError, t('saveError'));
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
      <TaxIncomeRegimeFields values={values} disabled={isDisabled} onChange={handleChange} />
      <TaxPpnFields values={values} disabled={isDisabled} onChange={handleChange} />
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
