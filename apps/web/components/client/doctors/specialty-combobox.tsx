'use client';

import type { Specialty } from '@hms/shared-types';
import { Combobox } from '@hms/ui';

type SpecialtyComboboxProps = {
  id?: string;
  specialties: Specialty[];
  value: string;
  isLoading?: boolean;
  hasError?: boolean;
  emptyOptionLabel?: string;
  onChange: (specialtyId: string) => void;
};

export function SpecialtyCombobox({
  id,
  specialties,
  value,
  isLoading = false,
  hasError = false,
  emptyOptionLabel,
  onChange,
}: SpecialtyComboboxProps) {
  return (
    <Combobox
      id={id}
      options={specialties.map((specialty) => ({ value: specialty.id, label: specialty.name }))}
      value={value}
      placeholder="Select specialty"
      searchPlaceholder="Search specialty..."
      emptyMessage="No specialty found."
      emptyOptionLabel={emptyOptionLabel}
      isLoading={isLoading}
      hasError={hasError}
      onChange={onChange}
    />
  );
}
