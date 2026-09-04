'use client';

import * as React from 'react';
import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react';

import { Badge } from '#components/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#components/command';
import { Popover, PopoverContent, PopoverTrigger } from '#components/popover';
import { cn } from '#lib/utils';

export type MultiComboboxOption = {
  value: string;
  label: string;
  /** Secondary text shown right-aligned on the option row. */
  description?: string;
  keywords?: string[];
};

type MultiComboboxProps = {
  id?: string;
  options: MultiComboboxOption[];
  values: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  /**
   * Labels for selected values that are not in `options` — needed with
   * server-driven search, where a new query drops earlier picks from the list
   * while they stay selected.
   */
  selectedLabels?: Record<string, string>;
  /** Controlled search text; pair with `onSearchValueChange` for server-driven search. */
  searchValue?: string;
  onSearchValueChange?: (searchValue: string) => void;
  /** Set false when the option list is already filtered by the server. */
  shouldFilter?: boolean;
  /** Accessible name for the remove button on each selected chip; receives the chip label. */
  removeLabel?: (label: string) => string;
  onChange: (values: string[]) => void;
};

/**
 * A combobox that keeps the list open and accumulates picks. Selected values
 * render as removable chips inside the trigger, so what will be submitted is
 * visible without opening the list.
 */
function MultiCombobox({
  id,
  options,
  values,
  placeholder = 'Select options',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  isLoading = false,
  disabled = false,
  hasError = false,
  selectedLabels = {},
  searchValue,
  onSearchValueChange,
  shouldFilter = true,
  removeLabel = (label: string) => `Remove ${label}`,
  onChange,
}: MultiComboboxProps) {
  const [isOpen, setIsOpen] = React.useState<boolean>(false);
  const optionLabels = new Map<string, string>(options.map((option) => [option.value, option.label]));
  const selectedChips = values.map((value) => ({
    value,
    label: optionLabels.get(value) ?? selectedLabels[value] ?? value,
  }));

  function handleToggle(nextValue: string): void {
    if (values.includes(nextValue)) {
      onChange(values.filter((value) => value !== nextValue));
      return;
    }
    onChange([...values, nextValue]);
  }

  function handleRemove(event: React.MouseEvent<HTMLButtonElement>, nextValue: string): void {
    event.preventDefault();
    event.stopPropagation();
    onChange(values.filter((value) => value !== nextValue));
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
    }
  }

  const isInactive = disabled || isLoading;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {/* A div, not a button: each chip carries its own remove button, and
            a button may not contain another. The role, tabIndex and key
            handler give it back what a button would have had. */}
        <div
          id={id}
          role="combobox"
          tabIndex={isInactive ? -1 : 0}
          aria-expanded={isOpen}
          aria-controls={isOpen ? `${id ?? 'multi-combobox'}-listbox` : undefined}
          aria-invalid={hasError}
          aria-disabled={isInactive}
          data-disabled={isInactive ? '' : undefined}
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            'flex min-h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs transition-[color,box-shadow] outline-none',
            'hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          )}
        >
          {selectedChips.length === 0 ? (
            <span className="truncate text-muted-foreground">
              {isLoading ? 'Loading…' : placeholder}
            </span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {selectedChips.map((chip) => (
                <Badge key={chip.value} variant="secondary" className="gap-1 pr-1">
                  <span className="max-w-48 truncate">{chip.label}</span>
                  <button
                    type="button"
                    aria-label={removeLabel(chip.label)}
                    disabled={disabled}
                    onClick={(event) => handleRemove(event, chip.value)}
                    className="rounded-full p-0.5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              ))}
            </span>
          )}
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={shouldFilter}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchValue}
            onValueChange={onSearchValueChange}
          />
          <CommandList id={`${id ?? 'multi-combobox'}-listbox`}>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = values.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    keywords={option.keywords}
                    aria-selected={isSelected}
                    onSelect={() => handleToggle(option.value)}
                  >
                    <span className="truncate">{option.label}</span>
                    {option.description ? (
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                    <CheckIcon
                      className={cn(
                        'size-4 shrink-0',
                        option.description ? '' : 'ml-auto',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { MultiCombobox };
