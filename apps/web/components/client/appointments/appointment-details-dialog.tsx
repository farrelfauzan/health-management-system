'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppointmentListItem, AppointmentResponse } from '@hms/shared-types';
import { APPOINTMENT_STATUS_TRANSITIONS, canTransitionAppointmentStatus } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useAbility,
} from '@hms/ui';

import { AvatarInitials } from '#components/shared/avatar-initials';
import { StatusBadge } from '#components/shared/status-badge';
import { appointmentManagementControllerUpdateAppointmentV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import {
  formatAppointmentDate,
  formatAppointmentTime,
} from '#lib/appointments/format-appointment-time';
import { invalidateAppointmentQueries } from '#lib/appointments/invalidate-appointment-queries';

const STATUS_UPDATE_ERROR_FALLBACK = 'Unable to update the appointment status. Please try again.';
const RESCHEDULABLE_STATUSES: AppointmentListItem['status'][] = ['SCHEDULED', 'CONFIRMED'];

type AppointmentTransitionTarget = 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW';

const TRANSITION_ACTION_LABELS: Record<AppointmentTransitionTarget, string> = {
  CONFIRMED: 'Confirm',
  COMPLETED: 'Mark Completed',
  NO_SHOW: 'Mark No-Show',
};

type AppointmentDetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentListItem;
  onReschedule: (appointment: AppointmentListItem) => void;
  onCancel: (appointment: AppointmentListItem) => void;
};

export function AppointmentDetailsDialog({
  open,
  onOpenChange,
  appointment,
  onReschedule,
  onCancel,
}: AppointmentDetailsDialogProps) {
  const ability = useAbility();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const statusMutation = useMutation({
    mutationFn: (status: AppointmentTransitionTarget) =>
      appointmentManagementControllerUpdateAppointmentV1(appointment.id, { status }),
  });
  const canUpdate = ability.can('update', 'Appointment');
  const allowedTargets = APPOINTMENT_STATUS_TRANSITIONS[appointment.status].filter(
    (status): status is AppointmentTransitionTarget => status !== 'CANCELLED',
  );
  const canReschedule = canUpdate && RESCHEDULABLE_STATUSES.includes(appointment.status);
  const canCancel =
    ability.can('cancel', 'Appointment') &&
    canTransitionAppointmentStatus(appointment.status, 'CANCELLED');

  async function handleTransition(status: AppointmentTransitionTarget): Promise<void> {
    setActionError(null);
    try {
      const response = await statusMutation.mutateAsync(status);
      parseApiSuccess<AppointmentResponse>(response, STATUS_UPDATE_ERROR_FALLBACK);
      await invalidateAppointmentQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setActionError(resolveApiErrorMessage(error, STATUS_UPDATE_ERROR_FALLBACK));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Appointment Details</DialogTitle>
          <DialogDescription>
            {formatAppointmentDate(appointment.scheduledAt)} at{' '}
            {formatAppointmentTime(appointment.scheduledAt)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {actionError ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {actionError}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AvatarInitials name={appointment.patient.fullName} />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {appointment.patient.fullName}
                </p>
                <p className="font-mono text-xs text-slate-500">{appointment.patient.mrn}</p>
              </div>
            </div>
            <StatusBadge status={appointment.status} />
          </div>
          <dl className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Doctor</dt>
              <dd className="text-right text-slate-900">
                {appointment.doctor.fullName}
                <span className="block text-xs text-slate-500">
                  {appointment.doctor.specialty}
                </span>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Reason</dt>
              <dd className="text-right text-slate-900">{appointment.reason ?? '—'}</dd>
            </div>
            {appointment.notes ? (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Notes</dt>
                <dd className="text-right text-slate-900">{appointment.notes}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        <DialogFooter className="flex-wrap">
          {canReschedule ? (
            <Button type="button" variant="outline" onClick={() => onReschedule(appointment)}>
              Reschedule
            </Button>
          ) : null}
          {canCancel ? (
            <Button type="button" variant="destructive" onClick={() => onCancel(appointment)}>
              Cancel Appointment
            </Button>
          ) : null}
          {canUpdate
            ? allowedTargets.map((status) => (
                <Button
                  key={status}
                  type="button"
                  disabled={statusMutation.isPending}
                  className="bg-primary-container hover:bg-primary"
                  onClick={() => void handleTransition(status)}
                >
                  {TRANSITION_ACTION_LABELS[status]}
                </Button>
              ))
            : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
