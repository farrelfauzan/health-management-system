import { createDoctorSchema, createPatientSchema } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { DOCTOR_FORM_REQUIRED_FIELDS } from '#lib/doctors/doctor-form-required-fields';
import { isRequiredField } from '#lib/forms/is-required-field';
import { listRequiredFields } from '#lib/forms/list-required-fields';
import { PATIENT_FORM_REQUIRED_FIELDS } from '#lib/patients/patient-form-required-fields';

/**
 * The fields each dialog marks with the red asterisk. Kept as a literal list
 * so a schema change that adds or drops a required field fails here and the
 * dialog gets updated on purpose, rather than silently marking the wrong set.
 */
const EXPECTED_PATIENT_REQUIRED_FIELDS: ReadonlyArray<string> = [
  'address',
  'dateOfBirth',
  'fullName',
  'phoneNumber',
  'privacyNotice',
  'sex',
];

const EXPECTED_DOCTOR_REQUIRED_FIELDS: ReadonlyArray<string> = [
  'fullName',
  'licenseNumber',
  'nik',
  'phoneNumber',
  'specialtyId',
];

describe('isRequiredField', () => {
  it('treats optional, nullable and defaulted fields as not required', () => {
    expect(isRequiredField({ schema: createPatientSchema, key: 'fullName' })).toBe(true);
    expect(isRequiredField({ schema: createPatientSchema, key: 'email' })).toBe(false);
    expect(isRequiredField({ schema: createPatientSchema, key: 'status' })).toBe(false);
    expect(isRequiredField({ schema: createPatientSchema, key: 'isActive' })).toBe(false);
  });

  it('reports an unknown key as not required', () => {
    expect(isRequiredField({ schema: createPatientSchema, key: 'mrn' })).toBe(false);
  });
});

describe('listRequiredFields', () => {
  it('matches the fields the patient form marks as required', () => {
    const actualSchemaFields = [...listRequiredFields(createPatientSchema)].sort();
    const actualFormFields = [...PATIENT_FORM_REQUIRED_FIELDS].sort();
    expect(actualSchemaFields).toEqual(EXPECTED_PATIENT_REQUIRED_FIELDS);
    expect(actualFormFields).toEqual(EXPECTED_PATIENT_REQUIRED_FIELDS);
  });

  it('matches the fields the doctor form marks as required', () => {
    const actualSchemaFields = [...listRequiredFields(createDoctorSchema)].sort();
    const actualFormFields = [...DOCTOR_FORM_REQUIRED_FIELDS].sort();
    expect(actualSchemaFields).toEqual(EXPECTED_DOCTOR_REQUIRED_FIELDS);
    expect(actualFormFields).toEqual(EXPECTED_DOCTOR_REQUIRED_FIELDS);
  });
});
