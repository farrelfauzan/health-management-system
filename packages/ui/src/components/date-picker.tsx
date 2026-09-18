'use client';

import * as React from 'react';
import { format, isValid, parse } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

import { Button } from '#components/button';
import { Calendar } from '#components/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '#components/popover';
import { cn } from '#lib/utils';

const DATE_PICKER_VALUE_FORMAT = 'yyyy-MM-dd';
const DATE_PICKER_DISPLAY_FORMAT = 'd MMM yyyy';
const LAST_MONTH_INDEX = 11;
const LAST_DAY_OF_DECEMBER = 31;

// The year dropdown needs an explicit range: react-day-picker offers the last
// 100 years and nothing beyond the current one when `startMonth`/`endMonth` are
// absent, which leaves every expiry field — a medicine batch, an STR, a shared
// document — unable to reach next year. Twenty years forward covers a licence
// and a shelf life; a hundred back covers a date of birth. A field that knows
// better narrows the range through `minValue` and `maxValue`.
const YEARS_SELECTABLE_IN_PAST = 100;
const YEARS_SELECTABLE_IN_FUTURE = 20;

type DatePickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  minValue?: string;
  /** Latest selectable day, `yyyy-MM-dd`. A date of birth passes today. */
  maxValue?: string;
  className?: string;
  captionLayout?: React.ComponentProps<typeof Calendar>['captionLayout'];
  onBlur?: () => void;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

function parseDatePickerValue(value: string): Date | undefined {
  if (value.length === 0) {
    return undefined;
  }
  const parsedDate = parse(value, DATE_PICKER_VALUE_FORMAT, new Date());
  return isValid(parsedDate) ? parsedDate : undefined;
}

function resolveStartMonth(minDate: Date | undefined): Date {
  return minDate ?? new Date(new Date().getFullYear() - YEARS_SELECTABLE_IN_PAST, 0, 1);
}

function resolveEndMonth(maxDate: Date | undefined): Date {
  return (
    maxDate ??
    new Date(
      new Date().getFullYear() + YEARS_SELECTABLE_IN_FUTURE,
      LAST_MONTH_INDEX,
      LAST_DAY_OF_DECEMBER,
    )
  );
}

export function DatePicker({
  value,
  onValueChange,
  id,
  placeholder = 'Pick a date',
  disabled = false,
  minValue,
  maxValue,
  className,
  captionLayout = 'dropdown',
  onBlur,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: DatePickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedDate = parseDatePickerValue(value);
  const minDate = parseDatePickerValue(minValue ?? '');
  const maxDate = parseDatePickerValue(maxValue ?? '');
  const disabledDays = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];
  function handleSelect(date: Date | undefined): void {
    onValueChange(date ? format(date, DATE_PICKER_VALUE_FORMAT) : '');
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
          data-empty={!selectedDate}
          className={cn(
            'w-full justify-start text-left font-normal data-[empty=true]:text-placeholder',
            className,
          )}
        >
          <CalendarIcon className="size-4" />
          {selectedDate ? format(selectedDate, DATE_PICKER_DISPLAY_FORMAT) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate ?? minDate ?? maxDate}
          startMonth={resolveStartMonth(minDate)}
          endMonth={resolveEndMonth(maxDate)}
          disabled={disabledDays.length > 0 ? disabledDays : undefined}
          captionLayout={captionLayout}
          onSelect={handleSelect}
        />
      </PopoverContent>
    </Popover>
  );
}
