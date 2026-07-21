'use client';

import type { AppointmentListItem } from '@hms/shared-types';
import { Skeleton } from '@hms/ui';

import { MonthViewDayCell } from '#components/client/appointments/month-view-day-cell';
import { isSameDay } from '#lib/appointments/week-range';
import { WEEKDAY_LABELS } from '#lib/appointments/weekday-labels';

type MonthViewProps = {
  monthDate: Date;
  days: Date[];
  appointments: AppointmentListItem[];
  isPending: boolean;
  onSelectAppointment: (appointment: AppointmentListItem) => void;
  onSelectDay: (day: Date) => void;
};

export function MonthView({
  monthDate,
  days,
  appointments,
  isPending,
  onSelectAppointment,
  onSelectDay,
}: MonthViewProps) {
  if (isPending) {
    return (
      <div className="p-4">
        <Skeleton className="h-[640px] w-full" />
      </div>
    );
  }
  const today = new Date();
  const sortedAppointments = [...appointments].sort((a, b) =>
    a.scheduledAt.localeCompare(b.scheduledAt),
  );
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="grid grid-cols-7 border-b border-slate-200">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="flex h-10 items-center justify-center font-heading text-[11px] font-medium tracking-wide text-slate-500"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => (
            <MonthViewDayCell
              key={day.toISOString()}
              day={day}
              isCurrentMonth={day.getMonth() === monthDate.getMonth()}
              isToday={isSameDay(day, today)}
              appointments={sortedAppointments.filter((appointment) =>
                isSameDay(new Date(appointment.scheduledAt), day),
              )}
              onSelectAppointment={onSelectAppointment}
              onSelectDay={onSelectDay}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
