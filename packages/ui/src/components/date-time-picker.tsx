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
  /** Latest selectable day, `yyyy-MM-dd`, passed through to the date half. */
  maxValue?: string;
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
  maxValue,
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
    // Side by side needs about 20rem. Below that — a form column on a phone, or
    // half a two-column dialog — the two sit on their own rows instead of
    // squeezing the date until it reads "16 Sep 20". The breakpoint follows
    // this component's own width, because the viewport says nothing about how
    // much room the field was given.
    <div
      className={cn(
        '@container/date-time flex flex-col gap-2 @xs/date-time:flex-row @xs/date-time:items-start',
        className,
      )}
    >
      <DatePicker
        id={id}
        value={date}
        onValueChange={handleDateChange}
        placeholder={labels.datePlaceholder}
        disabled={disabled}
        minValue={minValue}
        maxValue={maxValue}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="w-full min-w-0 @xs/date-time:flex-1"
      />
      <TimePicker
        value={shownTime}
        onValueChange={handleTimeChange}
        placeholder={labels.timePlaceholder}
        labels={{ hour: labels.hour, minute: labels.minute }}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="w-full @xs/date-time:w-32 @xs/date-time:shrink-0"
      />
    </div>
  );
}
