'use client';

import { cn } from '@hms/ui';

import {
  APPOINTMENT_STATUS_LEGEND,
  APPOINTMENT_STATUS_META,
} from '#lib/appointments/appointment-status-meta';

export function AppointmentStatusLegend() {
  return (
    <ul className="space-y-2">
      {APPOINTMENT_STATUS_LEGEND.map((status) => {
        const meta = APPOINTMENT_STATUS_META[status];
        return (
          <li key={status} className="flex items-center gap-3">
            <span className={cn('size-3 rounded-full', meta.dotClassName)} />
            <span className="text-sm text-slate-700">{meta.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
