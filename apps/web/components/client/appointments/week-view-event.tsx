'use client';

import type { AppointmentListItem } from '@hms/shared-types';
import { cn } from '@hms/ui';

import { APPOINTMENT_STATUS_META } from '#lib/appointments/appointment-status-meta';
import { formatAppointmentTime } from '#lib/appointments/format-appointment-time';

type WeekViewEventProps = {
  appointment: AppointmentListItem;
  onSelect: (appointment: AppointmentListItem) => void;
};

export function WeekViewEvent({ appointment, onSelect }: WeekViewEventProps) {
  const meta = APPOINTMENT_STATUS_META[appointment.status];
  return (
    <button
      type="button"
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-r-md border-l-4 p-1.5 text-left transition-shadow hover:shadow-md',
        meta.blockClassName,
      )}
      onClick={() => onSelect(appointment)}
    >
      <span className="w-full truncate font-heading text-xs font-semibold">
        {appointment.reason ?? meta.label}
      </span>
      <span className="w-full truncate text-[10px] text-slate-600">
        {appointment.patient.fullName} • {appointment.doctor.fullName}
      </span>
      <span className="w-full truncate text-[10px] text-slate-500">
        {formatAppointmentTime(appointment.scheduledAt)}
      </span>
    </button>
  );
}
