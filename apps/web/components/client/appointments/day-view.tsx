'use client';

import type { AppointmentListItem, DoctorSessionCalendarItem } from '@hms/shared-types';
import { Skeleton, cn } from '@hms/ui';

import { CurrentTimeIndicator } from '#components/client/appointments/current-time-indicator';
import { SessionCalendarBlock } from '#components/client/appointments/session-calendar-block';
import { WeekViewEvent } from '#components/client/appointments/week-view-event';
import {
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  layoutDayEvent,
  layoutDaySessionColumns,
} from '#lib/appointments/event-layout';
import { isSameDay } from '#lib/appointments/week-range';

const TIME_COLUMN_WIDTH_PX = 80;
const GRID_TEMPLATE_STYLE = {
  gridTemplateColumns: `${TIME_COLUMN_WIDTH_PX}px minmax(0, 1fr)`,
} as const;

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(displayHour).padStart(2, '0')}:00 ${period}`;
}

type DayViewProps = {
  day: Date;
  appointments: AppointmentListItem[];
  sessions: DoctorSessionCalendarItem[];
  isPending: boolean;
  onSelectAppointment: (appointment: AppointmentListItem) => void;
  onSelectSession: (session: DoctorSessionCalendarItem) => void;
};

export function DayView({
  day,
  appointments,
  sessions,
  isPending,
  onSelectAppointment,
  onSelectSession,
}: DayViewProps) {
  if (isPending) {
    return (
      <div className="p-4">
        <Skeleton className="h-[640px] w-full" />
      </div>
    );
  }
  const today = new Date();
  const isToday = isSameDay(day, today);
  const hours = Array.from(
    { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR },
    (_, index) => CALENDAR_START_HOUR + index,
  );
  return (
    <div>
      <div className="grid border-b border-slate-200" style={GRID_TEMPLATE_STYLE}>
        <div className="h-12 border-r border-slate-200" />
        <div
          className={cn(
            'flex h-12 items-center justify-center gap-2',
            isToday && 'bg-info-tint',
          )}
        >
          <span
            className={cn(
              'font-heading text-[11px] font-medium tracking-wide',
              isToday ? 'text-primary' : 'text-slate-500',
            )}
          >
            {day.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}
          </span>
          <span className={cn('text-sm font-bold', isToday ? 'text-primary' : 'text-slate-900')}>
            {day.getDate()}
          </span>
        </div>
      </div>
      <div className="relative">
        <div className="grid" style={GRID_TEMPLATE_STYLE}>
          <div className="border-r border-slate-200">
            {hours.map((hour) => (
              <div
                key={hour}
                className="flex h-[60px] justify-center border-b border-slate-100 pt-2 text-[11px] text-slate-500"
              >
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>
          <div className={cn(isToday && 'bg-info-tint/40')}>
            {hours.map((hour) => (
              <div key={hour} className="h-[60px] border-b border-slate-100" />
            ))}
          </div>
        </div>
        {layoutDaySessionColumns({ sessions, day }).map((placement, index) => {
          const session = sessions[index];
          if (!placement || !session) {
            return null;
          }
          return (
            <div
              key={`${session.doctorId}|${session.sessionDate}|${session.startTime}`}
              className="absolute z-10 p-0.5"
              style={{
                top: `${placement.topPx}px`,
                height: `${placement.heightPx}px`,
                left: `calc(${TIME_COLUMN_WIDTH_PX}px + (100% - ${TIME_COLUMN_WIDTH_PX}px) * ${placement.columnIndex / placement.columnCount})`,
                width: `calc((100% - ${TIME_COLUMN_WIDTH_PX}px) / ${placement.columnCount})`,
              }}
            >
              <SessionCalendarBlock session={session} onSelect={onSelectSession} />
            </div>
          );
        })}
        {appointments.map((appointment) => {
          const placement = layoutDayEvent({ scheduledAt: appointment.scheduledAt, day });
          if (!placement) {
            return null;
          }
          return (
            <div
              key={appointment.id}
              className="absolute z-10 p-0.5"
              style={{
                top: `${placement.topPx}px`,
                height: `${placement.heightPx}px`,
                left: `${TIME_COLUMN_WIDTH_PX}px`,
                width: `calc(100% - ${TIME_COLUMN_WIDTH_PX}px)`,
              }}
            >
              <WeekViewEvent appointment={appointment} onSelect={onSelectAppointment} />
            </div>
          );
        })}
        <CurrentTimeIndicator weekDays={[day]} />
      </div>
    </div>
  );
}
