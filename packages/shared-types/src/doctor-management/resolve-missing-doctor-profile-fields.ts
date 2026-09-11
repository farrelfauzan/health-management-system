import { createDoctorSchema } from '#doctor-management/schemas';
import type {
  DoctorProfileCompletenessRecord,
  ResolveMissingDoctorProfileFieldsParams,
} from '#doctor-management/types';

/**
 * Fields the create-doctor form requires that do not live on the profile.
 * The email is collected at creation but owned by `User` (D-024), and anyone
 * asking this question is already signed in with one.
 */
const ACCOUNT_FIELDS: ReadonlySet<string> = new Set(['email']);

/**
 * Where a form field is stored when it is not stored under its own name. The
 * NIK is encrypted at rest, so its presence is read off the masked suffix.
 */
const STORED_COLUMN_BY_FIELD: Readonly<Record<string, string>> = { nik: 'nikLast4' };

/**
 * Which required doctor-profile fields a stored profile is missing (P20-T02).
 *
 * The one definition of "complete", and it is derived rather than listed: the
 * required keys of the schema the create-doctor form validates, minus the
 * account's own email. A field made required there is therefore missing from
 * every profile that predates it, and the completion gate re-opens for those
 * doctors without anybody remembering to update a second list. An empty array
 * means complete; a missing profile is missing every field.
 *
 * `schema` exists for the test that proves exactly that property; production
 * callers leave it at the default.
 */
export function resolveMissingDoctorProfileFields({
  profile,
  schema = createDoctorSchema,
}: ResolveMissingDoctorProfileFieldsParams): string[] {
  return Object.keys(schema.shape)
    .filter((field) => !ACCOUNT_FIELDS.has(field))
    .filter((field) => {
      const fieldSchema = schema.shape[field];
      return fieldSchema !== undefined && !fieldSchema.isOptional() && !fieldSchema.isNullable();
    })
    .filter((field) => !hasStoredValue(profile, field));
}

function hasStoredValue(profile: DoctorProfileCompletenessRecord | null, field: string): boolean {
  if (!profile) {
    return false;
  }
  const value = profile[STORED_COLUMN_BY_FIELD[field] ?? field];
  return value !== null && value !== undefined && value !== '';
}
