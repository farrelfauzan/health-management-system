import type { CreatePatientInput } from '@hms/shared-types';

type OptionalPatientFormValues = {
  placeOfBirth: string;
  email: string;
  nik: string;
  bpjsNumber: string;
  bloodType: string;
  rhesusFactor: string;
  maritalStatus: string;
  religion: string;
  occupation: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  guardianName: string;
  guardianRelation: string;
};

type OptionalPatientFields = Partial<
  Pick<
    CreatePatientInput,
    | 'placeOfBirth'
    | 'email'
    | 'nik'
    | 'bpjsNumber'
    | 'bloodType'
    | 'rhesusFactor'
    | 'maritalStatus'
    | 'religion'
    | 'occupation'
    | 'emergencyContactName'
    | 'emergencyContactPhone'
    | 'guardianName'
    | 'guardianRelation'
  >
>;

function trimToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Drops every blank field rather than sending an empty string. The schemas
 * treat these as optional-when-absent, and — for NIK and BPJS number — a blank
 * must never overwrite a stored identifier the form only ever saw masked.
 */
export function buildPatientOptionalFields(
  values: OptionalPatientFormValues,
): OptionalPatientFields {
  const fields: OptionalPatientFields = {};
  const placeOfBirth = trimToUndefined(values.placeOfBirth);
  const email = trimToUndefined(values.email);
  const nik = trimToUndefined(values.nik);
  const bpjsNumber = trimToUndefined(values.bpjsNumber);
  const occupation = trimToUndefined(values.occupation);
  const emergencyContactName = trimToUndefined(values.emergencyContactName);
  const emergencyContactPhone = trimToUndefined(values.emergencyContactPhone);
  const guardianName = trimToUndefined(values.guardianName);
  const guardianRelation = trimToUndefined(values.guardianRelation);

  if (placeOfBirth) fields.placeOfBirth = placeOfBirth;
  if (email) fields.email = email;
  if (nik) fields.nik = nik;
  if (bpjsNumber) fields.bpjsNumber = bpjsNumber;
  if (occupation) fields.occupation = occupation;
  if (emergencyContactName) fields.emergencyContactName = emergencyContactName;
  if (emergencyContactPhone) fields.emergencyContactPhone = emergencyContactPhone;
  if (guardianName) fields.guardianName = guardianName;
  if (guardianRelation) fields.guardianRelation = guardianRelation;
  if (values.bloodType) fields.bloodType = values.bloodType as CreatePatientInput['bloodType'];
  if (values.rhesusFactor) {
    fields.rhesusFactor = values.rhesusFactor as CreatePatientInput['rhesusFactor'];
  }
  if (values.maritalStatus) {
    fields.maritalStatus = values.maritalStatus as CreatePatientInput['maritalStatus'];
  }
  if (values.religion) fields.religion = values.religion as CreatePatientInput['religion'];

  return fields;
}
