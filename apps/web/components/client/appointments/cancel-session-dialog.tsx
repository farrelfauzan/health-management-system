'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppointmentSessionCancelResult, DoctorSessionCalendarItem } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { appointmentSessionChangeControllerCancelSessionV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAppointmentQueries } from '#lib/appointments/invalidate-appointment-queries';
import { resolveMaterializedSessionId } from '#lib/appointments/resolve-materialized-session-id';

const REASON_MIN_LENGTH = 3;

type CancelSessionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: DoctorSessionCalendarItem;
};

/**
 * Cancels one practice-session occurrence with a reason the patients are
 * told (P28-T05). The weekly schedule is untouched.
 */
export function CancelSessionDialog({ open, onOpenChange, session }: CancelSessionDialogProps) {
  const t = useTranslations('operations.appointments.sessionChange');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const sessionId = await resolveMaterializedSessionId(session, t('cancelError'));
      return appointmentSessionChangeControllerCancelSessionV1(sessionId, {
        reason: reason.trim(),
      });
    },
  });

  async function handleCancel(): Promise<void> {
    if (reason.trim().length < REASON_MIN_LENGTH) {
      setFormError(t('reasonRequired'));
      return;
    }
    setFormError(null);
    try {
      const response = await cancelMutation.mutateAsync();
      parseApiSuccess<AppointmentSessionCancelResult>(response, t('cancelError'));
      await invalidateAppointmentQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setFormError(notifyApiError(error, t('cancelError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('cancelTitle')}</DialogTitle>
          <DialogDescription>
            {t('sessionSummary', {
              doctorName: session.doctor.fullName,
              sessionDate: session.sessionDate,
              startTime: session.startTime,
              endTime: session.endTime,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
          <div className="space-y-1.5">
            <FormLabel
              htmlFor="cancel-session-reason"
              className="font-heading text-xs text-slate-600"
              required
            >
              {t('reason')}
            </FormLabel>
            <Textarea
              id="cancel-session-reason"
              rows={3}
              value={reason}
              placeholder={t('reasonPlaceholder')}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <p className="text-sm text-slate-700">
            {t('patientsCancelled', { count: session.bookedCount })}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('keep')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={cancelMutation.isPending}
            onClick={() => void handleCancel()}
          >
            {cancelMutation.isPending ? t('cancellingSession') : t('submitCancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
