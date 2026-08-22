'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdmissionResponse, CancelAdmissionInput } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { admissionFlowControllerCancelAdmissionV1 } from '#lib/api/generated/admission-flow/admission-flow';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAdmissionQueries } from '#lib/admissions/invalidate-admission-queries';

type CancelAdmissionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admission: AdmissionResponse;
};

export function CancelAdmissionDialog({
  open,
  onOpenChange,
  admission,
}: CancelAdmissionDialogProps) {
  const t = useTranslations('operations');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const cancelMutation = useMutation({
    mutationFn: (payload: CancelAdmissionInput) =>
      admissionFlowControllerCancelAdmissionV1(admission.id, payload),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);

    // Required, unlike a discharge summary: cancelling erases a stay from the
    // ward census, and this field is the only account of why.
    if (reason.trim().length === 0) {
      setActionError(t('admissions.requiredFields'));
      return;
    }

    try {
      parseApiSuccess(
        await cancelMutation.mutateAsync({ reason: reason.trim() }),
        t('admissions.cancelError'),
      );
      await invalidateAdmissionQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setActionError(notifyApiError(error, t('admissions.cancelError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('admissions.cancel')}</DialogTitle>
          <DialogDescription>{t('admissions.cancelIsNotDischarge')}</DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">{t('admissions.cancelReason')}</Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <p className="text-sm text-slate-500">{admission.patient.fullName}</p>
          {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="destructive" disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? t('common.saving') : t('admissions.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
