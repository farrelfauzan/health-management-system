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

type DatePickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  minValue?: string;
  className?: string;
  captionLayout?: React.ComponentProps<typeof Calendar>['captionLayout'];
  onBlur?: () => void;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
};

function parseDatePickerValue(value: string): Date | undefined {
  if (value.length === 0) {
    return undefined;
  }
  const parsedDate = parse(value, DATE_PICKER_VALUE_FORMAT, new Date());
  return isValid(parsedDate) ? parsedDate : undefined;
}

export function DatePicker({
  value,
  onValueChange,
  id,
  placeholder = 'Pick a date',
  disabled = false,
  minValue,
  className,
  captionLayout = 'dropdown',
  onBlur,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: DatePickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedDate = parseDatePickerValue(value);
  const minDate = parseDatePickerValue(minValue ?? '');
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
          data-empty={!selectedDate}
          className={cn(
            'w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground',
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
          defaultMonth={selectedDate ?? minDate}
          disabled={minDate ? { before: minDate } : undefined}
          captionLayout={captionLayout}
          onSelect={handleSelect}
        />
      </PopoverContent>
    </Popover>
  );
}
