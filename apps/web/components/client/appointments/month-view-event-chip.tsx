'use client';

import type { AppointmentListItem } from '@hms/shared-types';
import { cn } from '@hms/ui';
import { useFormatter } from 'next-intl';

import { APPOINTMENT_STATUS_META } from '#lib/appointments/appointment-status-meta';

type MonthViewEventChipProps = {
  appointment: AppointmentListItem;
  onSelect: (appointment: AppointmentListItem) => void;
};

export function MonthViewEventChip({ appointment, onSelect }: MonthViewEventChipProps) {
  const format = useFormatter();
  const meta = APPOINTMENT_STATUS_META[appointment.status];
  return (
    <button
      type="button"
      className={cn(
        'flex w-full cursor-pointer items-center gap-1 overflow-hidden rounded px-1 py-0.5 text-left text-[10px] font-medium transition-shadow hover:shadow-sm',
        meta.blockClassName,
      )}
      onClick={() => onSelect(appointment)}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', meta.dotClassName)} />
      <span className="shrink-0 font-mono">
        {format.dateTime(new Date(appointment.scheduledAt), { timeStyle: 'short' })}
      </span>
      <span className="truncate">{appointment.patient.fullName}</span>
    </button>
  );
}
