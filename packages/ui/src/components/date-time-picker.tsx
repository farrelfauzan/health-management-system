'use client';

import * as React from 'react';

import { DatePicker } from '#components/date-picker';
import { TimePicker } from '#components/time-picker';
import { cn } from '#lib/utils';

const DATE_TIME_SEPARATOR = 'T';
const TIME_VALUE_LENGTH = 5;

type DateTimePickerLabels = {
  datePlaceholder: string;
  timePlaceholder: string;
  hour: string;
  minute: string;
};

type DateTimeParts = {
  date: string;
  time: string;
};

type DateTimePickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  minValue?: string;
  defaultTime?: string;
  className?: string;
  labels?: DateTimePickerLabels;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

const DEFAULT_DATE_TIME_PICKER_LABELS: DateTimePickerLabels = {
  datePlaceholder: 'Pick a date',
  timePlaceholder: 'Pick a time',
  hour: 'Hour',
  minute: 'Minute',
};

function splitDateTimeValue(value: string): DateTimeParts {
  const [date = '', time = ''] = value.split(DATE_TIME_SEPARATOR);
  return { date, time: time.slice(0, TIME_VALUE_LENGTH) };
}

/**
 * A date and a time side by side, producing `yyyy-MM-ddTHH:mm` — the value
 * `<input type="datetime-local">` produced, so `new Date(value)` at the call
 * site keeps meaning local time.
 *
 * The value stays empty until a date exists. A time picked first is held and
 * applied when the date arrives; a date picked first takes `defaultTime`,
 * which is visible beside it and can be changed. Clearing the date clears the
 * value, which is how an optional field is emptied.
 */
export function DateTimePicker({
  value,
  onValueChange,
  id,
  disabled = false,
  minValue,
  defaultTime = '00:00',
  className,
  labels = DEFAULT_DATE_TIME_PICKER_LABELS,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: DateTimePickerProps): React.JSX.Element {
  const { date, time } = splitDateTimeValue(value);
  const [pendingTime, setPendingTime] = React.useState(time);
  const shownTime = date === '' ? pendingTime : time;
  function handleDateChange(nextDate: string): void {
    setPendingTime(shownTime);
    onValueChange(
      nextDate === '' ? '' : `${nextDate}${DATE_TIME_SEPARATOR}${shownTime || defaultTime}`,
    );
  }
  function handleTimeChange(nextTime: string): void {
    setPendingTime(nextTime);
    if (date !== '') {
      onValueChange(`${date}${DATE_TIME_SEPARATOR}${nextTime}`);
    }
  }
  return (
    <div className={cn('flex gap-2', className)}>
      <DatePicker
        id={id}
        value={date}
        onValueChange={handleDateChange}
        placeholder={labels.datePlaceholder}
        disabled={disabled}
        minValue={minValue}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="min-w-0 flex-1"
      />
      <TimePicker
        value={shownTime}
        onValueChange={handleTimeChange}
        placeholder={labels.timePlaceholder}
        labels={{ hour: labels.hour, minute: labels.minute }}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="w-32 shrink-0"
      />
    </div>
  );
}
