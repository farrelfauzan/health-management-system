'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClinicianFeeRuleView } from '@hms/shared-types';
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

import { ClinicianFeeRuleTargetFields } from '#components/client/billing/clinician-fee-rule-target-fields';
import { ClinicianFeeRuleTermsFields } from '#components/client/billing/clinician-fee-rule-terms-fields';
import { InlineNotice } from '#components/client/shared/inline-notice';
import {
  clinicianFeeRuleControllerCreateRuleV1,
  clinicianFeeRuleControllerUpdateRuleV1,
} from '#lib/api/generated/clinician-fees/clinician-fees';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import type { ClinicianFeeRuleFormValues } from '#lib/clinician-fees/clinician-fee-rule-form-values';
import { invalidateClinicianFeeQueries } from '#lib/clinician-fees/invalidate-clinician-fee-queries';
import { resolveClinicianFeeErrorCode } from '#lib/clinician-fees/resolve-clinician-fee-error-code';
import { toClinicianFeeRuleFormValues } from '#lib/clinician-fees/to-clinician-fee-rule-form-values';
import { toCreateClinicianFeeRuleInput } from '#lib/clinician-fees/to-create-clinician-fee-rule-input';
import { toUpdateClinicianFeeRuleInput } from '#lib/clinician-fees/to-update-clinician-fee-rule-input';

type ClinicianFeeRuleFormDialogProps = {
  /** `null` creates a rule; a rule edits its terms. */
  rule: ClinicianFeeRuleView | null;
  onClose: () => void;
};

/**
 * Creates a jasa medis rule or changes its terms (P27-T06). The target and
 * clinician are fixed after creation, so the edit form shows only the terms.
 */
export function ClinicianFeeRuleFormDialog({ rule, onClose }: ClinicianFeeRuleFormDialogProps) {
  const t = useTranslations('operations.billing.fees');
  const tCommon = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const isEdit = rule !== null;
  const [values, setValues] = useState<ClinicianFeeRuleFormValues>(() =>
    toClinicianFeeRuleFormValues(rule),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: async (formValues: ClinicianFeeRuleFormValues) => {
      if (rule !== null) {
        const payload = toUpdateClinicianFeeRuleInput(formValues);
        return payload ? clinicianFeeRuleControllerUpdateRuleV1(rule.id, payload) : null;
      }
      const payload = toCreateClinicianFeeRuleInput(formValues);
      return payload ? clinicianFeeRuleControllerCreateRuleV1(payload) : null;
    },
  });
  const onChange = (change: Partial<ClinicianFeeRuleFormValues>): void =>
    setValues((current) => ({ ...current, ...change }));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      const response = await saveMutation.mutateAsync(values);
      if (response === null) {
        setFormError(t('form.invalid'));
        return;
      }
      parseApiSuccess<ClinicianFeeRuleView>(response, t('form.saveError'));
      await invalidateClinicianFeeQueries(queryClient);
      toast.success(isEdit ? t('form.saved') : t('form.created'));
      onClose();
    } catch (caughtError) {
      const code = resolveClinicianFeeErrorCode(caughtError);
      setFormError(code ? t(`errors.${code}`) : notifyApiError(caughtError, t('form.saveError')));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {isEdit ? t('form.editTitle') : t('form.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t('form.editDescription') : t('form.description')}
          </DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
          {isEdit ? null : (
            <ClinicianFeeRuleTargetFields
              values={values}
              disabled={saveMutation.isPending}
              onChange={onChange}
            />
          )}
          <ClinicianFeeRuleTermsFields
            values={values}
            disabled={saveMutation.isPending}
            onChange={onChange}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? tCommon('saving') : t('form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
