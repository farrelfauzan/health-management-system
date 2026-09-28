'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PayerTypeValue, RegistrationListItem } from '@hms/shared-types';
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

import { PayerTypeSelect } from '#components/client/registrations/payer-type-select';
import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { registrationFlowControllerUpdateRegistrationV1 } from '#lib/api/generated/registration-flow/registration-flow';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateRegistrationQueries } from '#lib/registrations/invalidate-registration-queries';

type RegistrationPayerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registration: RegistrationListItem;
};

/**
 * Corrects who pays for a visit (P29-T07): for a visit recorded before the
 * payer was asked, or one the desk got wrong.
 */
export function RegistrationPayerDialog({
  open,
  onOpenChange,
  registration,
}: RegistrationPayerDialogProps) {
  const t = useTranslations('operations.registrations.payer');
  const queryClient = useQueryClient();
  const [payerType, setPayerType] = useState<PayerTypeValue | undefined>(registration.payerType);
  const [actionError, setActionError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (nextPayerType: PayerTypeValue) =>
      registrationFlowControllerUpdateRegistrationV1(registration.id, {
        payerType: nextPayerType,
      }),
  });

  async function handleSave(): Promise<void> {
    if (!payerType) {
      setActionError(t('required'));
      return;
    }
    setActionError(null);
    try {
      const response = await saveMutation.mutateAsync(payerType);
      parseApiSuccess<RegistrationListItem>(response, t('changeError'));
      await invalidateRegistrationQueries(queryClient);
      toast.success(t('changeSuccess'));
      onOpenChange(false);
    } catch (error) {
      setActionError(notifyApiError(error, t('changeError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('change')}</DialogTitle>
          <DialogDescription>
            {t('changeDescription', { name: registration.patient.fullName })}
          </DialogDescription>
        </DialogHeader>
        {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
        <div className="space-y-1.5">
          <FormLabel
            htmlFor="registration-payer-change-select"
            className="font-heading text-xs text-slate-600"
            required
          >
            {t('label')}
          </FormLabel>
          <PayerTypeSelect
            id="registration-payer-change-select"
            value={payerType}
            onChange={setPayerType}
            disabled={saveMutation.isPending}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending}
            className="bg-primary-container hover:bg-primary"
            onClick={() => void handleSave()}
          >
            {saveMutation.isPending ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
