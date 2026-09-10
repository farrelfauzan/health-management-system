import { isRequiredField } from '#lib/forms/is-required-field';
import type { RequiredFieldSchema } from '#lib/forms/required-field-schema.types';

/**
 * Every key of an object schema that {@link isRequiredField} reports as
 * required, so a form can mark its labels from the same source the API
 * validates against.
 */
export function listRequiredFields(schema: RequiredFieldSchema): ReadonlySet<string> {
  const requiredKeys = Object.keys(schema.shape).filter((key) => isRequiredField({ schema, key }));
  return new Set(requiredKeys);
}
