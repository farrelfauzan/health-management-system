'use client';

import { Input, Label } from '@hms/ui';

type ClinicProfileTextFieldProps = {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel';
  disabled?: boolean;
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
  onChange,
}: ClinicProfileTextFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
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
