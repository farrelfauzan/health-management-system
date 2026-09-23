'use client';

import type { CoretaxReferenceOption } from '@hms/shared-types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';

const NO_OPTION_VALUE = '__none__';

type TaxCoretaxReferenceSelectProps = {
  id: string;
  /** The chosen code, or `''` for none. */
  value: string;
  options: readonly CoretaxReferenceOption[];
  noneLabel: string;
  disabled?: boolean;
  onChange: (code: string) => void;
};

/**
 * A choice from one of DJP's Coretax reference lists (P27-T09) — units of
 * measure, keterangan tambahan, cap fasilitas — printed with DJP's own code
 * and label so it can be checked against the template.
 */
export function TaxCoretaxReferenceSelect({
  id,
  value,
  options,
  noneLabel,
  disabled = false,
  onChange,
}: TaxCoretaxReferenceSelectProps) {
  return (
    <Select
      value={value === '' ? NO_OPTION_VALUE : value}
      disabled={disabled}
      onValueChange={(next) => onChange(next === NO_OPTION_VALUE ? '' : next)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_OPTION_VALUE}>{noneLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.code} value={option.code}>
            {option.code} — {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
