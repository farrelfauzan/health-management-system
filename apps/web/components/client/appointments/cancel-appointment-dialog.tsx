'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppointmentListItem, AppointmentResponse } from '@hms/shared-types';
import { cancelAppointmentSchema } from '@hms/shared-types';
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

import { appointmentManagementControllerCancelAppointmentV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import {
  formatAppointmentDate,
  formatAppointmentTime,
} from '#lib/appointments/format-appointment-time';
import { invalidateAppointmentQueries } from '#lib/appointments/invalidate-appointment-queries';

const CANCEL_ERROR_FALLBACK = 'Unable to cancel the appointment. Please try again.';

type CancelAppointmentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentListItem;
};

export function CancelAppointmentDialog({
  open,
  onOpenChange,
  appointment,
}: CancelAppointmentDialogProps) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string>('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelMutation = useMutation({
    mutationFn: (input: { reason?: string }) =>
      appointmentManagementControllerCancelAppointmentV1(appointment.id, input),
  });

  async function handleCancelAppointment(): Promise<void> {
    setCancelError(null);
    const parsed = cancelAppointmentSchema.safeParse({
      reason: reason.trim() ? reason.trim() : undefined,
    });
    if (!parsed.success) {
      setCancelError(parsed.error.issues[0]?.message ?? 'Invalid cancellation reason.');
      return;
    }
    try {
      const response = await cancelMutation.mutateAsync(parsed.data);
      parseApiSuccess<AppointmentResponse>(response, CANCEL_ERROR_FALLBACK);
      await invalidateAppointmentQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setCancelError(notifyApiError(error, CANCEL_ERROR_FALLBACK));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Cancel Appointment</DialogTitle>
          <DialogDescription>
            Cancel {appointment.patient.fullName}&apos;s visit with{' '}
            {appointment.doctor.fullName} on {formatAppointmentDate(appointment.scheduledAt)} at{' '}
            {formatAppointmentTime(appointment.scheduledAt)}. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {cancelError ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {cancelError}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <label
              htmlFor="cancel-appointment-reason"
              className="block font-heading text-xs font-medium text-slate-600"
            >
              Reason (optional)
            </label>
            <Textarea
              id="cancel-appointment-reason"
              rows={3}
              value={reason}
              placeholder="Why is this appointment being cancelled?"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Keep Appointment
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={cancelMutation.isPending}
            onClick={() => void handleCancelAppointment()}
          >
            {cancelMutation.isPending ? 'Cancelling…' : 'Cancel Appointment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
