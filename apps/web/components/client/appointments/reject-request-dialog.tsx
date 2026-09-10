'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppointmentListItem, AppointmentResponse } from '@hms/shared-types';
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

import { InlineNotice } from '#components/client/shared/inline-notice';
import { appointmentManagementControllerRejectAppointmentV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAppointmentQueries } from '#lib/appointments/invalidate-appointment-queries';

type RejectRequestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: AppointmentListItem;
};

export function RejectRequestDialog({ open, onOpenChange, request }: RejectRequestDialogProps) {
  const t = useTranslations('operations');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const rejectMutation = useMutation({
    mutationFn: () =>
      appointmentManagementControllerRejectAppointmentV1(request.id, { reason: reason.trim() }),
  });

  async function handleReject(): Promise<void> {
    setFormError(null);
    if (reason.trim().length < 2) {
      setFormError(t('appointments.labels.rejectionRequired'));
      return;
    }
    try {
      const response = await rejectMutation.mutateAsync();
      parseApiSuccess<AppointmentResponse>(response, t('appointments.rejectError'));
      await invalidateAppointmentQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setFormError(notifyApiError(error, t('appointments.rejectError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('appointments.labels.rejectTitle')}</DialogTitle>
          <DialogDescription>
            {request.subject.fullName} with {request.doctor.fullName} — the patient will see the
            rejection reason.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
          <div className="space-y-1.5">
            <Label
              htmlFor="reject-request-reason"
              className="font-heading text-xs text-slate-600"
            >
              Reason
            </Label>
            <Textarea
              id="reject-request-reason"
              rows={3}
              value={reason}
              placeholder={t('appointments.labels.rejectPlaceholder')}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={rejectMutation.isPending}
            onClick={() => void handleReject()}
          >
            {rejectMutation.isPending ? 'Rejecting…' : 'Reject Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
