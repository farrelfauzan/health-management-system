import { describe, expect, it } from 'vitest';

import { buildPatientCoreFields } from './build-patient-core-fields';

// What the form holds after opening Edit on a chat-created draft: the API
// returns no birth date, sex or address, and the form defaults them to ''.
const DRAFT_FORM = {
  fullName: 'Muhammad Farrel Fauzan',
  dateOfBirth: '',
  sex: '',
  status: 'OUT_PATIENT',
  phoneNumber: '6281381035295',
  address: '',
};

describe('buildPatientCoreFields', () => {
  it('omits the fields a chat draft never captured', () => {
    const fields = buildPatientCoreFields(DRAFT_FORM);

    expect(fields).not.toHaveProperty('dateOfBirth');
    expect(fields).not.toHaveProperty('sex');
    expect(fields).not.toHaveProperty('address');
  });

  it('keeps the fields the draft does carry', () => {
    expect(buildPatientCoreFields(DRAFT_FORM)).toEqual({
      fullName: 'Muhammad Farrel Fauzan',
      phoneNumber: '6281381035295',
      status: 'OUT_PATIENT',
    });
  });

  it('sends every core field once the record is complete', () => {
    const fields = buildPatientCoreFields({
      fullName: 'Budi Santoso',
      dateOfBirth: '1985-03-12',
      sex: 'MALE',
      status: 'OUT_PATIENT',
      phoneNumber: '+62-812-1000-0001',
      address: 'Jl. Merdeka No. 12, Jakarta Pusat',
    });

    expect(fields).toEqual({
      fullName: 'Budi Santoso',
      dateOfBirth: '1985-03-12',
      sex: 'MALE',
      status: 'OUT_PATIENT',
      phoneNumber: '+62-812-1000-0001',
      address: 'Jl. Merdeka No. 12, Jakarta Pusat',
    });
  });

  it('treats a whitespace-only value as blank so it never clears a stored one', () => {
    const fields = buildPatientCoreFields({ ...DRAFT_FORM, address: '   ' });

    expect(fields).not.toHaveProperty('address');
  });

  it('trims the values it does send', () => {
    const fields = buildPatientCoreFields({ ...DRAFT_FORM, address: '  Jl. Merdeka No. 12  ' });

    expect(fields.address).toBe('Jl. Merdeka No. 12');
  });
});
