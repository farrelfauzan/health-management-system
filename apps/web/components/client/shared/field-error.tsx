'use client';

import { getFieldErrorMessage } from '#lib/forms/field-error-message';

type FieldErrorProps = {
  errors: ReadonlyArray<unknown>;
};

export function FieldError({ errors }: FieldErrorProps) {
  if (errors.length === 0) {
    return null;
  }
  return <p className="text-xs text-rose-600">{getFieldErrorMessage(errors)}</p>;
}
