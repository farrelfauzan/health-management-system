import type { UpdatePatientInput } from '@hms/shared-types';

type CorePatientFormValues = {
  fullName: string;
  dateOfBirth: string;
  sex: string;
  status: string;
  phoneNumber: string;
  address: string;
};

type CorePatientFields = Pick<
  UpdatePatientInput,
  'fullName' | 'dateOfBirth' | 'sex' | 'status' | 'phoneNumber' | 'address'
>;

function trimToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Drops every blank core field instead of sending an empty string, mirroring
 * `buildPatientOptionalFields` for the fields a create requires.
 *
 * A blank here means the record never had the value — a chat draft carries no
 * birth date, sex or address — so sending `''` would fail `updatePatientSchema`
 * (its minimum lengths still apply to any value present) and block the very
 * edit meant to fill the record in. Omitting the key leaves the stored value
 * untouched, which is what "the front desk completes the record" needs.
 */
export function buildPatientCoreFields(values: CorePatientFormValues): CorePatientFields {
  const fields: CorePatientFields = {};
  const fullName = trimToUndefined(values.fullName);
  const dateOfBirth = trimToUndefined(values.dateOfBirth);
  const phoneNumber = trimToUndefined(values.phoneNumber);
  const address = trimToUndefined(values.address);

  if (fullName) fields.fullName = fullName;
  if (dateOfBirth) fields.dateOfBirth = dateOfBirth;
  if (phoneNumber) fields.phoneNumber = phoneNumber;
  if (address) fields.address = address;
  if (values.sex) fields.sex = values.sex as UpdatePatientInput['sex'];
  if (values.status) fields.status = values.status as UpdatePatientInput['status'];

  return fields;
}
