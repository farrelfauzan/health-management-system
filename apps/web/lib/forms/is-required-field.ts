import type { RequiredFieldSchema } from '#lib/forms/required-field-schema.types';

type IsRequiredFieldParams = {
  schema: RequiredFieldSchema;
  key: string;
};

/**
 * Whether a key of an object schema rejects an absent value. A field wrapped in
 * `.optional()`, `.nullable()` or `.default()` is not required, because the
 * form can submit it blank and the API still accepts the payload.
 */
export function isRequiredField({ schema, key }: IsRequiredFieldParams): boolean {
  const fieldSchema = schema.shape[key];
  if (!fieldSchema) {
    return false;
  }
  return !fieldSchema.isOptional() && !fieldSchema.isNullable();
}
