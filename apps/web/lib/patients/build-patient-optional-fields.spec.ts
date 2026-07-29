import { describe, expect, it } from 'vitest';

import { buildPatientOptionalFields } from './build-patient-optional-fields';

const EMPTY_FORM = {
  placeOfBirth: '',
  email: '',
  nik: '',
  bpjsNumber: '',
  bloodType: '',
  rhesusFactor: '',
  maritalStatus: '',
  religion: '',
  occupation: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  guardianName: '',
  guardianRelation: '',
};

describe('buildPatientOptionalFields', () => {
  it('omits every blank field rather than sending empty strings', () => {
    expect(buildPatientOptionalFields(EMPTY_FORM)).toEqual({});
  });

  it('never sends a blank identifier, so a masked NIK is not overwritten', () => {
    const fields = buildPatientOptionalFields({ ...EMPTY_FORM, occupation: 'Guru' });

    expect(fields).not.toHaveProperty('nik');
    expect(fields).not.toHaveProperty('bpjsNumber');
    expect(fields.occupation).toBe('Guru');
  });

  it('sends identifiers when they are typed', () => {
    const fields = buildPatientOptionalFields({
      ...EMPTY_FORM,
      nik: '3201234567890123',
      bpjsNumber: '0001234567890',
    });

    expect(fields.nik).toBe('3201234567890123');
    expect(fields.bpjsNumber).toBe('0001234567890');
  });

  it('trims surrounding whitespace', () => {
    const fields = buildPatientOptionalFields({ ...EMPTY_FORM, placeOfBirth: '  Bandung  ' });

    expect(fields.placeOfBirth).toBe('Bandung');
  });

  it('passes enum selections through untouched', () => {
    const fields = buildPatientOptionalFields({
      ...EMPTY_FORM,
      bloodType: 'O',
      rhesusFactor: 'POSITIVE',
      maritalStatus: 'MARRIED',
      religion: 'ISLAM',
    });

    expect(fields).toMatchObject({
      bloodType: 'O',
      rhesusFactor: 'POSITIVE',
      maritalStatus: 'MARRIED',
      religion: 'ISLAM',
    });
  });
});
