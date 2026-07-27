'use client';

import type { DoctorListItem } from '@hms/shared-types';
import { Combobox } from '@hms/ui';

type DoctorComboboxProps = {
  id?: string;
  doctors: DoctorListItem[];
  value: string;
  isLoading?: boolean;
  hasError?: boolean;
  emptyOptionLabel?: string;
  onChange: (doctorId: string) => void;
};

export function DoctorCombobox({
  id,
  doctors,
  value,
  isLoading = false,
  hasError = false,
  emptyOptionLabel,
  onChange,
}: DoctorComboboxProps) {
  return (
    <Combobox
      id={id}
      options={doctors.map((doctor) => ({
        value: doctor.id,
        label: `${doctor.fullName} (${doctor.specialty})`,
      }))}
      value={value}
      placeholder="Select doctor"
      searchPlaceholder="Search by name or specialty..."
      emptyMessage="No doctor found."
      emptyOptionLabel={emptyOptionLabel}
      isLoading={isLoading}
      hasError={hasError}
      onChange={onChange}
    />
  );
}
