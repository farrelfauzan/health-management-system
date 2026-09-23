'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ALLOWED_FAKTUR_CODES_BY_TREATMENT,
  PPN_TREATMENTS,
  type CreateTaxCodeInput,
  type FakturTransactionCodeValue,
  type PpnTreatmentValue,
  type TaxCodeView,
  type UpdateTaxCodeInput,
} from '@hms/shared-types';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { TaxCoretaxFields } from '#components/client/taxes/tax-coretax-fields';
import { TaxRateFields } from '#components/client/taxes/tax-rate-fields';
import {
  taxCodeControllerCreateTaxCodeV1,
  taxCodeControllerUpdateTaxCodeV1,
} from '#lib/api/generated/tax-codes/tax-codes';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateTaxCodeQueries } from '#lib/taxes/invalidate-tax-code-queries';
import { resolveTaxCodeErrorCode } from '#lib/taxes/resolve-tax-code-error-code';
import type { TaxCodeFormValues } from '#lib/taxes/tax-code-form-values';
import { toCreateTaxCodeInput } from '#lib/taxes/to-create-tax-code-input';
import { toTaxCodeFormValues } from '#lib/taxes/to-tax-code-form-values';
import { toUpdateTaxCodeInput } from '#lib/taxes/to-update-tax-code-input';

type TaxCodeFormDialogProps = {
  /** Absent to create a code. */
  taxCode?: TaxCodeView;
  onClose: () => void;
};

const NO_FAKTUR_CODE = 'NONE';
const CORETAX_ITEM_CODE_PATTERN = /^\d{6}$/;

/**
 * Creates a clinic tax code or edits one (P27-T03). The treatment is chosen
 * once: moving a code between exempt and taxed would re-tax every item using
 * it, so that is a new code. A system code keeps its faktur code too. Any
 * faktur code carries the Coretax item code and unit, and a kode-08 code its
 * exemption facility (P27-T09).
 */
export function TaxCodeFormDialog({ taxCode, onClose }: TaxCodeFormDialogProps) {
  const t = useTranslations('operations.taxes.codes');
  const tTreatment = useTranslations('operations.taxes.treatment');
  const tCommon = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const isEdit = taxCode !== undefined;
  const [values, setValues] = useState<TaxCodeFormValues>(() => toTaxCodeFormValues(taxCode));
  const [formError, setFormError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (payload: CreateTaxCodeInput) => taxCodeControllerCreateTaxCodeV1(payload),
  });
  const updateMutation = useMutation({
    mutationFn: (payload: UpdateTaxCodeInput) =>
      taxCodeControllerUpdateTaxCodeV1(taxCode?.id ?? '', payload),
  });
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const fakturOptions = ALLOWED_FAKTUR_CODES_BY_TREATMENT[values.ppnTreatment];
  const isFakturLocked = isEdit && (taxCode.isSystem || taxCode.ppnTreatment !== 'STANDARD');

  function update(change: Partial<TaxCodeFormValues>): void {
    setValues((current) => ({ ...current, ...change }));
  }

  function handleTreatmentChange(treatment: PpnTreatmentValue): void {
    update({
      ppnTreatment: treatment,
      fakturTransactionCode: ALLOWED_FAKTUR_CODES_BY_TREATMENT[treatment][0] ?? '',
    });
  }

  async function saveTaxCode(): Promise<boolean> {
    const itemCode = values.coretax.coretaxItemCode;
    if (itemCode !== '' && !CORETAX_ITEM_CODE_PATTERN.test(itemCode)) {
      setFormError(t('form.coretaxInvalid'));
      return false;
    }
    if (taxCode) {
      const response = await updateMutation.mutateAsync(toUpdateTaxCodeInput(values, taxCode));
      parseApiSuccess<TaxCodeView>(response, t('saveError'));
      return true;
    }
    const payload = toCreateTaxCodeInput(values);
    if (payload === null) {
      setFormError(t('form.invalid'));
      return false;
    }
    parseApiSuccess<TaxCodeView>(await createMutation.mutateAsync(payload), t('saveError'));
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    try {
      if (!(await saveTaxCode())) {
        return;
      }
      await invalidateTaxCodeQueries(queryClient);
      toast.success(t('saved'));
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
            {isEdit ? t('form.editTitle', { code: taxCode.code }) : t('form.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('form.description')}</DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <FormLabel htmlFor="tax-code-code" required>
                {t('form.code')}
              </FormLabel>
              <Input
                id="tax-code-code"
                className="font-mono"
                value={values.code}
                disabled={isEdit || isSaving}
                placeholder="ESTETIKA"
                onChange={(event) => update({ code: event.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-1">
              <FormLabel htmlFor="tax-code-treatment" required>
                {t('form.treatment')}
              </FormLabel>
              <Select
                value={values.ppnTreatment}
                disabled={isEdit || isSaving}
                onValueChange={(value) => handleTreatmentChange(value as PpnTreatmentValue)}
              >
                <SelectTrigger id="tax-code-treatment" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PPN_TREATMENTS.map((treatment) => (
                    <SelectItem key={treatment} value={treatment}>
                      {tTreatment(treatment)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <FormLabel htmlFor="tax-code-name" required>
              {t('form.name')}
            </FormLabel>
            <Input
              id="tax-code-name"
              value={values.name}
              disabled={isSaving}
              onChange={(event) => update({ name: event.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <FormLabel htmlFor="tax-code-faktur">{t('form.faktur')}</FormLabel>
              <Select
                value={
                  values.fakturTransactionCode === ''
                    ? NO_FAKTUR_CODE
                    : values.fakturTransactionCode
                }
                disabled={isFakturLocked || isSaving}
                onValueChange={(value) =>
                  update({
                    fakturTransactionCode:
                      value === NO_FAKTUR_CODE ? '' : (value as FakturTransactionCodeValue),
                  })
                }
              >
                <SelectTrigger id="tax-code-faktur" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fakturOptions.map((option) => (
                    <SelectItem key={option ?? NO_FAKTUR_CODE} value={option ?? NO_FAKTUR_CODE}>
                      {option === null ? t('form.noFaktur') : t(`faktur.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <FormLabel htmlFor="tax-code-note">{t('form.invoiceNote')}</FormLabel>
              <Input
                id="tax-code-note"
                value={values.invoiceNote}
                disabled={isSaving}
                onChange={(event) => update({ invoiceNote: event.target.value })}
              />
            </div>
          </div>
          {!isEdit && values.ppnTreatment === 'STANDARD' ? (
            <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold text-slate-700">
                {t('form.initialRate')}
              </legend>
              <TaxRateFields
                idPrefix="tax-code-initial-rate"
                values={values.initialRate}
                disabled={isSaving}
                onChange={(change) => update({ initialRate: { ...values.initialRate, ...change } })}
              />
            </fieldset>
          ) : null}
          {values.fakturTransactionCode !== '' ? (
            <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold text-slate-700">
                {t('form.coretaxTitle')}
              </legend>
              <p className="text-xs text-slate-500">{t('form.coretaxDescription')}</p>
              <TaxCoretaxFields
                idPrefix="tax-code-coretax"
                values={values.coretax}
                isExempt={values.fakturTransactionCode === '08'}
                disabled={isSaving}
                onChange={(change) => update({ coretax: { ...values.coretax, ...change } })}
              />
            </fieldset>
          ) : null}
          {isEdit ? (
            <Label className="flex cursor-pointer items-center gap-2.5 font-normal">
              <Checkbox
                checked={values.isActive}
                disabled={isSaving}
                onCheckedChange={(checked) => update({ isActive: checked === true })}
              />
              <span className="text-sm text-slate-900">{t('form.isActive')}</span>
            </Label>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? tCommon('saving') : t('form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
