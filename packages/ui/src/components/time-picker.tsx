'use client';

import * as React from 'react';
import { ClockIcon } from 'lucide-react';

import { Button } from '#components/button';
import { Popover, PopoverContent, PopoverTrigger } from '#components/popover';
import { TimePickerColumn } from '#components/time-picker-column';
import { cn } from '#lib/utils';

const HOURS_IN_DAY = 24;
const MINUTES_IN_HOUR = 60;
// Seconds are accepted on the way in because some API fields carry them
// (`08:00:00`); the picker always hands back `HH:mm`, as <input type="time"> did.
const TIME_PICKER_VALUE_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

type TimePickerLabels = {
  hour: string;
  minute: string;
};

type TimeParts = {
  hour: string;
  minute: string;
};

type TimePickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  labels?: TimePickerLabels;
  onBlur?: () => void;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

const DEFAULT_TIME_PICKER_LABELS: TimePickerLabels = { hour: 'Hour', minute: 'Minute' };

function buildTwoDigitRange(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String(index).padStart(2, '0'));
}

const HOUR_OPTIONS = buildTwoDigitRange(HOURS_IN_DAY);
const MINUTE_OPTIONS = buildTwoDigitRange(MINUTES_IN_HOUR);

function parseTimePickerValue(value: string): TimeParts | undefined {
  const match = TIME_PICKER_VALUE_PATTERN.exec(value);
  return match ? { hour: match[1] ?? '00', minute: match[2] ?? '00' } : undefined;
}

/**
 * A 24-hour time picker: a Popover with an hour column and a minute column.
 * Value is `HH:mm` (empty string when unset), the same contract as the native
 * `<input type="time">` it replaces. Choosing a minute closes the picker;
 * choosing an hour does not, because the minute is usually the next click.
 */
export function TimePicker({
  value,
  onValueChange,
  id,
  placeholder = 'Pick a time',
  disabled = false,
  className,
  labels = DEFAULT_TIME_PICKER_LABELS,
  onBlur,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: TimePickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedTime = parseTimePickerValue(value);
  function handleHourSelect(hour: string): void {
    onValueChange(`${hour}:${selectedTime?.minute ?? '00'}`);
  }
  function handleMinuteSelect(minute: string): void {
    onValueChange(`${selectedTime?.hour ?? '00'}:${minute}`);
    setIsOpen(false);
  }
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          disabled={disabled}
          onBlur={onBlur}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          data-empty={!selectedTime}
          className={cn(
            'w-full justify-start text-left font-normal tabular-nums data-[empty=true]:text-placeholder',
            className,
          )}
        >
          <ClockIcon className="size-4" />
          {selectedTime ? `${selectedTime.hour}:${selectedTime.minute}` : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto divide-x p-0" align="start">
        <TimePickerColumn
          label={labels.hour}
          options={HOUR_OPTIONS}
          selected={selectedTime?.hour}
          onSelect={handleHourSelect}
        />
        <TimePickerColumn
          label={labels.minute}
          options={MINUTE_OPTIONS}
          selected={selectedTime?.minute}
          onSelect={handleMinuteSelect}
        />
      </PopoverContent>
    </Popover>
  );
}
