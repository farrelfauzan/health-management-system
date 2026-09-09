'use client';

import { PhoneInput } from '@hms/ui';

import { FormLabel } from '#components/client/shared/form-label';

type ClinicProfilePhoneFieldProps = {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

/**
 * The clinic's phone number, in the same fixed-prefix box the patient and
 * doctor forms use (`SJ-166`). Its own file rather than a `type` on
 * {@link ClinicProfileTextField} because a phone field is not a text input
 * with a different keyboard: its value is canonicalised on every keystroke.
 */
export function ClinicProfilePhoneField({
  id,
  label,
  value,
  disabled = false,
  onChange,
}: ClinicProfilePhoneFieldProps) {
  return (
    <div className="space-y-2">
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <PhoneInput
        id={id}
        value={value}
        placeholder="8123456789"
        disabled={disabled}
        onValueChange={onChange}
      />
    </div>
  );
}
