'use client';

import * as React from 'react';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { Button } from '#components/button';
import { Popover, PopoverContent, PopoverTrigger } from '#components/popover';
import { cn } from '#lib/utils';

const MONTHS_IN_YEAR = 12;
const MONTH_PICKER_VALUE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

type MonthPickerLabels = {
  previousYear: string;
  nextYear: string;
};

type YearMonth = {
  year: number;
  monthIndex: number;
};

type MonthPickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  locale?: string;
  className?: string;
  labels?: MonthPickerLabels;
  'aria-label'?: string;
};

const DEFAULT_MONTH_PICKER_LABELS: MonthPickerLabels = {
  previousYear: 'Previous year',
  nextYear: 'Next year',
};

function parseMonthPickerValue(value: string): YearMonth | undefined {
  const match = MONTH_PICKER_VALUE_PATTERN.exec(value);
  return match ? { year: Number(match[1]), monthIndex: Number(match[2]) - 1 } : undefined;
}

function formatMonthPickerValue({ year, monthIndex }: YearMonth): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function formatMonthName(
  yearMonth: YearMonth,
  locale: string | undefined,
  month: 'short' | 'long',
): string {
  const options: Intl.DateTimeFormatOptions =
    month === 'long' ? { month, year: 'numeric' } : { month };
  return new Date(yearMonth.year, yearMonth.monthIndex, 1).toLocaleString(locale, options);
}

/**
 * A month picker: a Popover with a year stepper over a 3×4 grid of months.
 * Value is `yyyy-MM`, the contract of the `<input type="month">` it replaces.
 * Month names follow `locale`, so the Indonesian UI reads "Sep", "Okt".
 */
export function MonthPicker({
  value,
  onValueChange,
  id,
  placeholder = 'Pick a month',
  disabled = false,
  locale,
  className,
  labels = DEFAULT_MONTH_PICKER_LABELS,
  'aria-label': ariaLabel,
}: MonthPickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedMonth = parseMonthPickerValue(value);
  const [shownYear, setShownYear] = React.useState(selectedMonth?.year ?? new Date().getFullYear());
  function handleOpenChange(nextOpen: boolean): void {
    if (nextOpen) {
      setShownYear(selectedMonth?.year ?? new Date().getFullYear());
    }
    setIsOpen(nextOpen);
  }
  function handleMonthSelect(monthIndex: number): void {
    onValueChange(formatMonthPickerValue({ year: shownYear, monthIndex }));
    setIsOpen(false);
  }
  const monthIndexes = Array.from({ length: MONTHS_IN_YEAR }, (_, index) => index);
  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          data-empty={!selectedMonth}
          className={cn(
            'w-full justify-start text-left font-normal data-[empty=true]:text-placeholder',
            className,
          )}
        >
          <CalendarIcon className="size-4" />
          {selectedMonth ? formatMonthName(selectedMonth, locale, 'long') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="mb-3 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={labels.previousYear}
            onClick={() => setShownYear((year) => year - 1)}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums" aria-live="polite">
            {shownYear}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={labels.nextYear}
            onClick={() => setShownYear((year) => year + 1)}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {monthIndexes.map((monthIndex) => {
            const isSelected =
              selectedMonth?.year === shownYear && selectedMonth.monthIndex === monthIndex;
            return (
              <Button
                key={monthIndex}
                type="button"
                size="sm"
                variant={isSelected ? 'default' : 'ghost'}
                aria-pressed={isSelected}
                onClick={() => handleMonthSelect(monthIndex)}
              >
                {formatMonthName({ year: shownYear, monthIndex }, locale, 'short')}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
