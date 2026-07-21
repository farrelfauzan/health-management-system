'use client';

import type { DoctorScheduleEntryInput } from '@hms/shared-types';
import {
  Button,
  Checkbox,
  Icon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';

import { formatDayOfWeekLabel } from '#lib/doctors/day-of-week-label';

const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;

type DoctorScheduleEntryRowProps = {
  entry: DoctorScheduleEntryInput;
  index: number;
  onChange: (index: number, entry: DoctorScheduleEntryInput) => void;
  onRemove: (index: number) => void;
};

export function DoctorScheduleEntryRow({
  entry,
  index,
  onChange,
  onRemove,
}: DoctorScheduleEntryRowProps) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={String(entry.dayOfWeek)}
        onValueChange={(value) => onChange(index, { ...entry, dayOfWeek: Number(value) })}
      >
        <SelectTrigger className="w-24" aria-label={`Day for entry ${index + 1}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DAYS_OF_WEEK.map((day) => (
            <SelectItem key={day} value={String(day)}>
              {formatDayOfWeekLabel(day)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="time"
        className="w-28"
        aria-label={`Start time for entry ${index + 1}`}
        value={entry.startTime}
        onChange={(event) => onChange(index, { ...entry, startTime: event.target.value })}
      />
      <span className="text-sm text-slate-400">–</span>
      <Input
        type="time"
        className="w-28"
        aria-label={`End time for entry ${index + 1}`}
        value={entry.endTime}
        onChange={(event) => onChange(index, { ...entry, endTime: event.target.value })}
      />
      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
        <Checkbox
          checked={entry.isAvailable}
          aria-label={`Availability for entry ${index + 1}`}
          onCheckedChange={(checked) => onChange(index, { ...entry, isAvailable: checked === true })}
        />
        Available
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove entry ${index + 1}`}
        onClick={() => onRemove(index)}
      >
        <Icon name="delete" size={16} className="text-slate-500" />
      </Button>
    </div>
  );
}
