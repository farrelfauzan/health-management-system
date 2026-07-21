'use client';

import type { AppointmentListItem } from '@hms/shared-types';
import { cn } from '@hms/ui';

import { MonthViewEventChip } from '#components/client/appointments/month-view-event-chip';

const MAX_VISIBLE_EVENTS = 3;
const WEEKEND_DAY_INDEXES = [0, 6];

type MonthViewDayCellProps = {
  day: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  appointments: AppointmentListItem[];
  onSelectAppointment: (appointment: AppointmentListItem) => void;
  onSelectDay: (day: Date) => void;
};

export function MonthViewDayCell({
  day,
  isCurrentMonth,
  isToday,
  appointments,
  onSelectAppointment,
  onSelectDay,
}: MonthViewDayCellProps) {
  const visibleAppointments = appointments.slice(0, MAX_VISIBLE_EVENTS);
  const hiddenCount = appointments.length - visibleAppointments.length;
  const isWeekend = WEEKEND_DAY_INDEXES.includes(day.getDay());
  return (
    <div
      className={cn(
        'min-h-28 space-y-1 border-b border-r border-slate-100 p-1.5',
        isWeekend && 'bg-slate-50',
        isToday && 'bg-info-tint/40',
      )}
    >
      <button
        type="button"
        aria-label={`Open ${day.toDateString()}`}
        className={cn(
          'flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors hover:bg-slate-100',
          isCurrentMonth ? 'text-slate-900' : 'text-slate-400',
          isToday && 'bg-primary-container text-white hover:bg-primary',
        )}
        onClick={() => onSelectDay(day)}
      >
        {day.getDate()}
      </button>
      {visibleAppointments.map((appointment) => (
        <MonthViewEventChip
          key={appointment.id}
          appointment={appointment}
          onSelect={onSelectAppointment}
        />
      ))}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="w-full rounded px-1 py-0.5 text-left text-[10px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          onClick={() => onSelectDay(day)}
        >
          +{hiddenCount} more
        </button>
      ) : null}
    </div>
  );
}
