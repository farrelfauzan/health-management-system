'use client';

import * as React from 'react';

import { Input } from '#components/input';
import { cn } from '#lib/utils';
import { toNationalPhoneDigits } from '#lib/to-national-phone-digits';

const DEFAULT_COUNTRY_CODE = '62';

type PhoneInputProps = Omit<
  React.ComponentProps<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'type'
> & {
  /**
   * The stored number, country code included and nothing else: `6281234567890`,
   * or `''` when the field is empty. The box shows only its national part.
   */
  value: string;
  /** Receives the same canonical shape, or `''` once the field is cleared. */
  onValueChange: (value: string) => void;
  /** Without the `+`. Indonesia today; a country selector would set it. */
  countryCode?: string;
};

/**
 * A phone field whose country code is furniture (`SJ-166`).
 *
 * Testers typed `08…`, `+62…` and `62…` into the old bare text box
 * interchangeably, and each one was stored verbatim, so the same person could
 * exist twice under two spellings of one number. The fix is to stop asking:
 * `+62` is rendered as a non-editable box inside the input's left edge, the
 * user types only the rest, and what leaves the component is always
 * `62` + national digits.
 *
 * Everything the field accepts collapses to the national part on the way in —
 * a paste of `0812…`, `+62812…`, `62812…` or `812…` all display as `812…` —
 * so a number copied out of a spreadsheet, a chat or a card lands correctly
 * without the user editing it. Non-digits are dropped rather than rejected
 * with an error: there is nothing to explain about a space or a dash the user
 * did not mean to type.
 *
 * Controlled, and canonical in both directions: edit mode is simply a `value`
 * that already carries a country code, which the box strips for display.
 */
export function PhoneInput({
  value,
  onValueChange,
  countryCode = DEFAULT_COUNTRY_CODE,
  className,
  ...props
}: PhoneInputProps) {
  const nationalDigits = toNationalPhoneDigits(value, countryCode);
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const nextNationalDigits = toNationalPhoneDigits(event.target.value, countryCode);
    onValueChange(nextNationalDigits === '' ? '' : `${countryCode}${nextNationalDigits}`);
  };
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        data-slot="phone-input-prefix"
        className="pointer-events-none absolute inset-y-1 left-1 flex select-none items-center rounded-sm border border-input bg-muted px-2 text-sm text-muted-foreground"
      >
        +{countryCode}
      </span>
      <Input
        {...props}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        className={cn('pl-14', className)}
        value={nationalDigits}
        onChange={handleChange}
      />
    </div>
  );
}
