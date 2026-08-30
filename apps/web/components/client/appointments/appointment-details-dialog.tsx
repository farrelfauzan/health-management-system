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
import { useFormatter, useTranslations } from 'next-intl';

import { AvatarInitials } from '#components/shared/avatar-initials';
import { StatusBadge } from '#components/shared/status-badge';
import { appointmentManagementControllerUpdateAppointmentV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateAppointmentQueries } from '#lib/appointments/invalidate-appointment-queries';
import { AppointmentSubjectMrn } from './appointment-subject-mrn';

const RESCHEDULABLE_STATUSES: AppointmentListItem['status'][] = ['SCHEDULED', 'CONFIRMED'];

type AppointmentTransitionTarget = 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW';

type AppointmentDetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentListItem;
  onReschedule: (appointment: AppointmentListItem) => void;
  onCancel: (appointment: AppointmentListItem) => void;
  onViewQueue?: (sessionId: string) => void;
};

export function AppointmentDetailsDialog({
  open,
  onOpenChange,
  appointment,
  onReschedule,
  onCancel,
  onViewQueue,
}: AppointmentDetailsDialogProps) {
  const t = useTranslations('operations');
  const format = useFormatter();
  const ability = useAbility();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const statusMutation = useMutation({
    mutationFn: (status: AppointmentTransitionTarget) =>
      appointmentManagementControllerUpdateAppointmentV1(appointment.id, { status }),
  });
  const canUpdate = ability.can('update', 'Appointment');
  const allowedTargets = APPOINTMENT_STATUS_TRANSITIONS[appointment.status].filter(
    (status): status is AppointmentTransitionTarget =>
      status === 'CONFIRMED' || status === 'COMPLETED' || status === 'NO_SHOW',
  );
  const canReschedule =
    canUpdate &&
    appointment.type !== 'SESSION' &&
    RESCHEDULABLE_STATUSES.includes(appointment.status);
  const canViewQueue =
    Boolean(appointment.sessionId && onViewQueue) && ability.can('read', 'AppointmentSession');
  const canCancel =
    ability.can('cancel', 'Appointment') &&
    canTransitionAppointmentStatus(appointment.status, 'CANCELLED');

  async function handleTransition(status: AppointmentTransitionTarget): Promise<void> {
    setActionError(null);
    try {
      const response = await statusMutation.mutateAsync(status);
      parseApiSuccess<AppointmentResponse>(response, t('appointments.updateError'));
      await invalidateAppointmentQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setActionError(notifyApiError(error, t('appointments.updateError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('appointments.details')}</DialogTitle>
          <DialogDescription>
            {t('appointments.atTime', {
              date: format.dateTime(new Date(appointment.scheduledAt), { dateStyle: 'medium' }),
              time: format.dateTime(new Date(appointment.scheduledAt), { timeStyle: 'short' }),
            })}
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
              <AvatarInitials name={appointment.subject.fullName} />
              <div>
                <p className="text-sm font-medium text-slate-900">{appointment.subject.fullName}</p>
                <AppointmentSubjectMrn subject={appointment.subject} />
              </div>
            </div>
            <StatusBadge
              status={appointment.status}
              label={t(`common.statuses.${appointment.status}`)}
            />
          </div>
          <dl className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t('common.doctor')}</dt>
              <dd className="text-right text-slate-900">
                {appointment.doctor.fullName}
                <span className="block text-xs text-slate-500">{appointment.doctor.specialty}</span>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t('common.reason')}</dt>
              <dd className="text-right text-slate-900">{appointment.reason ?? '—'}</dd>
            </div>
            {appointment.notes ? (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('common.notes')}</dt>
                <dd className="text-right text-slate-900">{appointment.notes}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        <DialogFooter className="flex-wrap">
          {canViewQueue && appointment.sessionId ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onViewQueue?.(appointment.sessionId as string)}
            >
              {t('appointments.viewQueue')}
            </Button>
          ) : null}
          {canReschedule ? (
            <Button type="button" variant="outline" onClick={() => onReschedule(appointment)}>
              {t('appointments.reschedule')}
            </Button>
          ) : null}
          {canCancel ? (
            <Button type="button" variant="destructive" onClick={() => onCancel(appointment)}>
              {t('appointments.cancel')}
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
                  {status === 'CONFIRMED'
                    ? t('appointments.confirm')
                    : status === 'COMPLETED'
                      ? t('appointments.markCompleted')
                      : t('appointments.markNoShow')}
                </Button>
              ))
            : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
