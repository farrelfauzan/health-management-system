'use client';

import { Input } from '@hms/ui';

import { FormLabel } from '#components/client/shared/form-label';

type ClinicProfileTextFieldProps = {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel';
  disabled?: boolean;
  /** Marks the label; the clinic name is the only field the API insists on. */
  isRequired?: boolean;
  onChange: (value: string) => void;
};

/**
 * One labelled text input on the clinic-profile form. Its own file because
 * the form has seven of them and an inline helper would be seven copies of
 * the same label/input/spacing decision.
 */
export function ClinicProfileTextField({
  id,
  label,
  value,
  placeholder,
  type = 'text',
  disabled = false,
  isRequired = false,
  onChange,
}: ClinicProfileTextFieldProps) {
  return (
    <div className="space-y-2">
      <FormLabel htmlFor={id} required={isRequired}>
        {label}
      </FormLabel>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
