'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateTaxCodeRateInput, TaxCodeView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { TaxRateFields } from '#components/client/taxes/tax-rate-fields';
import { taxCodeControllerAddTaxCodeRateV1 } from '#lib/api/generated/tax-codes/tax-codes';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateTaxCodeQueries } from '#lib/taxes/invalidate-tax-code-queries';
import { resolveTaxCodeErrorCode } from '#lib/taxes/resolve-tax-code-error-code';
import type { TaxRateFormValues } from '#lib/taxes/tax-rate-form-values';
import { toCreateTaxCodeRateInput } from '#lib/taxes/to-create-tax-code-rate-input';

type TaxCodeRateDialogProps = {
  taxCode: TaxCodeView;
  onClose: () => void;
};

/**
 * Schedules a new rate on a taxed code (P27-T03). It starts on its date and
 * never rewrites the old one: invoices issued before it keep their rate.
 */
export function TaxCodeRateDialog({ taxCode, onClose }: TaxCodeRateDialogProps) {
  const t = useTranslations('operations.taxes.codes');
  const tCommon = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const latest = taxCode.rates.at(-1);
  const [values, setValues] = useState<TaxRateFormValues>({
    ratePercent: latest ? String(latest.ratePercent) : '',
    dppNumerator: latest ? String(latest.dppNumerator) : '1',
    dppDenominator: latest ? String(latest.dppDenominator) : '1',
    effectiveFrom: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: CreateTaxCodeRateInput) =>
      taxCodeControllerAddTaxCodeRateV1(taxCode.id, payload),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const payload = toCreateTaxCodeRateInput(values);
    if (payload === null) {
      setFormError(t('rate.invalid'));
      return;
    }
    try {
      parseApiSuccess<TaxCodeView>(await saveMutation.mutateAsync(payload), t('saveError'));
      await invalidateTaxCodeQueries(queryClient);
      toast.success(t('rateSaved'));
      onClose();
    } catch (caughtError) {
      const code = resolveTaxCodeErrorCode(caughtError);
      setFormError(code ? t(`errors.${code}`) : notifyApiError(caughtError, t('saveError')));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t('rateDialogTitle', { code: taxCode.code })}
          </DialogTitle>
          <DialogDescription>
            {t('rateDialogDescription', { date: latest?.effectiveFrom ?? '—' })}
          </DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
          <TaxRateFields
            idPrefix="tax-code-rate"
            values={values}
            disabled={saveMutation.isPending}
            onChange={(change) => setValues((current) => ({ ...current, ...change }))}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? tCommon('saving') : t('addRate')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
