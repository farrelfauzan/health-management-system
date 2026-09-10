'use client';

import * as React from 'react';

import { Button } from '#components/button';

type TimePickerColumnProps = {
  label: string;
  options: readonly string[];
  selected: string | undefined;
  onSelect: (option: string) => void;
};

/**
 * One scrollable column of a {@link TimePicker}: hours or minutes. The
 * selected entry is scrolled to the middle on mount, so reopening the picker
 * lands on the current value instead of the top of a 60-row list.
 */
export function TimePickerColumn({
  label,
  options,
  selected,
  onSelect,
}: TimePickerColumnProps): React.JSX.Element {
  const selectedRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    // jsdom has no layout, so scrollIntoView is absent there.
    selectedRef.current?.scrollIntoView?.({ block: 'center' });
  }, []);
  return (
    <div className="flex flex-col">
      <p className="px-2 pt-2 pb-1 text-center text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <div
        role="listbox"
        aria-label={label}
        className="flex h-56 w-16 flex-col gap-0.5 overflow-y-auto p-1"
      >
        {options.map((option) => {
          const isSelected = option === selected;
          return (
            <Button
              key={option}
              ref={isSelected ? selectedRef : undefined}
              type="button"
              role="option"
              aria-selected={isSelected}
              variant={isSelected ? 'default' : 'ghost'}
              size="sm"
              className="shrink-0 tabular-nums"
              onClick={() => onSelect(option)}
            >
              {option}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
