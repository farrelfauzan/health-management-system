'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdmissionResponse, TransferAdmissionInput } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { BedPickerField } from '#components/client/admissions/bed-picker-field';
import { admissionFlowControllerTransferAdmissionV1 } from '#lib/api/generated/admission-flow/admission-flow';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { formatBedLocation } from '#lib/admissions/format-bed-location';
import { invalidateAdmissionQueries } from '#lib/admissions/invalidate-admission-queries';

type TransferAdmissionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admission: AdmissionResponse;
};

export function TransferAdmissionDialog({
  open,
  onOpenChange,
  admission,
}: TransferAdmissionDialogProps) {
  const t = useTranslations('operations');
  const queryClient = useQueryClient();
  const [bedId, setBedId] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const transferMutation = useMutation({
    mutationFn: (payload: TransferAdmissionInput) =>
      admissionFlowControllerTransferAdmissionV1(admission.id, payload),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);

    if (!bedId) {
      setActionError(t('admissions.requiredFields'));
      return;
    }

    try {
      parseApiSuccess(await transferMutation.mutateAsync({ bedId }), t('admissions.transferError'));
      await invalidateAdmissionQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setActionError(notifyApiError(error, t('admissions.transferError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('admissions.transfer')}</DialogTitle>
          <DialogDescription>
            {admission.patient.fullName}
            {admission.currentBed ? ` — ${formatBedLocation(admission.currentBed)}` : ''}
          </DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <BedPickerField
            id="transfer-bed"
            label={t('admissions.targetBed')}
            value={bedId}
            onChange={setBedId}
            excludedBedId={admission.currentBed?.id}
          />
          {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={transferMutation.isPending}>
              {transferMutation.isPending ? t('common.saving') : t('admissions.transfer')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
