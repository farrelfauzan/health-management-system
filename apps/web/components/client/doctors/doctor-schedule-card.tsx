'use client';

import type { DoctorDetail } from '@hms/shared-types';
import { Button, Can, Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';

import { StatusBadge } from '#components/shared/status-badge';
import { formatDayOfWeekLabel } from '#lib/doctors/day-of-week-label';

type DoctorScheduleCardProps = {
  doctor: DoctorDetail;
  onManageSchedule: () => void;
};

export function DoctorScheduleCard({ doctor, onManageSchedule }: DoctorScheduleCardProps) {
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          Weekly Schedule
        </CardTitle>
        <Can action="write" subject="DoctorSchedule">
          <Button type="button" size="sm" variant="outline" onClick={onManageSchedule}>
            <Icon name="calendar_month" size={16} />
            Manage
          </Button>
        </Can>
      </CardHeader>
      <CardContent className="space-y-2">
        {doctor.schedules.length === 0 ? (
          <p className="text-sm text-slate-500">No schedule entries yet.</p>
        ) : (
          doctor.schedules.map((schedule) => (
            <div key={schedule.id} className="flex items-center gap-3 text-sm">
              <span className="w-10 font-heading text-xs font-medium uppercase text-slate-500">
                {formatDayOfWeekLabel(schedule.dayOfWeek)}
              </span>
              <span className="font-mono text-[13px] text-slate-700">
                {schedule.startTime}–{schedule.endTime}
              </span>
              <StatusBadge status={schedule.isAvailable ? 'active' : 'inactive'} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
