'use client';

import * as React from 'react';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';

import { Button } from '#components/button';
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

export type ComboboxOption = {
  value: string;
  label: string;
  keywords?: string[];
};

type ComboboxProps = {
  id?: string;
  options: ComboboxOption[];
  value: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  emptyOptionLabel?: string;
  isLoading?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  onChange: (value: string) => void;
};

function Combobox({
  id,
  options,
  value,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  emptyOptionLabel,
  isLoading = false,
  disabled = false,
  hasError = false,
  onChange,
}: ComboboxProps) {
  const [isOpen, setIsOpen] = React.useState<boolean>(false);
  const selectedOption = options.find((option) => option.value === value);
  const unselectedLabel = emptyOptionLabel ?? (isLoading ? 'Loading…' : placeholder);

  function handleSelect(nextValue: string): void {
    onChange(nextValue);
    setIsOpen(false);
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={isOpen}
          aria-invalid={hasError}
          disabled={disabled || isLoading}
          className="w-full justify-between font-normal"
        >
          <span
            className={cn(
              'truncate',
              !selectedOption && !emptyOptionLabel && 'text-muted-foreground',
            )}
          >
            {selectedOption?.label ?? unselectedLabel}
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {emptyOptionLabel ? (
                <CommandItem value={emptyOptionLabel} onSelect={() => handleSelect('')}>
                  {emptyOptionLabel}
                  <CheckIcon
                    className={cn('ml-auto size-4', value === '' ? 'opacity-100' : 'opacity-0')}
                  />
                </CommandItem>
              ) : null}
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  keywords={option.keywords}
                  onSelect={() => handleSelect(option.value)}
                >
                  <span className="truncate">{option.label}</span>
                  <CheckIcon
                    className={cn(
                      'ml-auto size-4',
                      option.value === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { Combobox };
