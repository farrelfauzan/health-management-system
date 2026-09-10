'use client';

import { Combobox, type ComboboxOption } from '@hms/ui';

import { FormLabel } from '#components/client/shared/form-label';

type PatientAddressRegionFieldProps = {
  id: string;
  label: string;
  isRequired: boolean;
  options: ComboboxOption[];
  value: string;
  /** Shown on the trigger while the chosen row is not in `options` yet. */
  selectedLabel?: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  isLoading: boolean;
  isDisabled: boolean;
  error?: string;
  onChange: (option: { code: string; name: string }) => void;
  /** Set together for a level whose list the server filters (villages). */
  searchValue?: string;
  onSearchValueChange?: (searchValue: string) => void;
};

/**
 * One level of the address cascade: a labelled searchable combobox with its own
 * error line.
 *
 * Answers with the chosen row's name as well as its code, because the name is
 * what the trigger has to keep showing after a search drops the row from the
 * fetched page, and what an edit shows before the lists arrive.
 */
export function PatientAddressRegionField({
  id,
  label,
  isRequired,
  options,
  value,
  selectedLabel,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  isLoading,
  isDisabled,
  error,
  onChange,
  searchValue,
  onSearchValueChange,
}: PatientAddressRegionFieldProps) {
  function handleChange(nextCode: string): void {
    const option = options.find((candidate) => candidate.value === nextCode);
    onChange({ code: nextCode, name: option?.label ?? '' });
  }

  return (
    <div className="space-y-1.5">
      <FormLabel htmlFor={id} className="font-heading text-xs text-slate-600" required={isRequired}>
        {label}
      </FormLabel>
      <Combobox
        id={id}
        options={options}
        value={value}
        selectedLabel={selectedLabel}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        isLoading={isLoading}
        disabled={isDisabled}
        hasError={error !== undefined}
        searchValue={searchValue}
        onSearchValueChange={onSearchValueChange}
        shouldFilter={onSearchValueChange === undefined}
        onChange={handleChange}
      />
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
