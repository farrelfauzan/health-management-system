import {
  bpjsNumberSchema,
  collectNikDemographicWarnings,
  createPatientSchema,
  maskIdentifierLast4,
  nikSchema,
  normaliseIdentifierDigits,
  patientAllergiesSchema,
  updatePatientSchema,
} from '@hms/shared-types';

const inputBasePatient = {
  mrn: 'MRN-0001',
  fullName: 'Aisha Rahman',
  dateOfBirth: '1990-05-12',
  sex: 'FEMALE' as const,
  phoneNumber: '+628123456789',
  address: 'Jakarta',
};

describe('normaliseIdentifierDigits', () => {
  it('strips separators so equivalent inputs hash identically', () => {
    expect(normaliseIdentifierDigits('3201 0112 3456 7890')).toBe('3201011234567890');
    expect(normaliseIdentifierDigits('3201-0112-3456-7890')).toBe('3201011234567890');
  });

  it('is idempotent', () => {
    const actualOnce = normaliseIdentifierDigits('3201 0112 3456 7890');
    expect(normaliseIdentifierDigits(actualOnce)).toBe(actualOnce);
  });
});

describe('nikSchema', () => {
  it('accepts a 16-digit value written with separators', () => {
    expect(nikSchema.parse('3201 0112 3456 7890')).toBe('3201011234567890');
  });

  it('rejects a value that is too short', () => {
    expect(nikSchema.safeParse('320101123456789').success).toBe(false);
  });

  it('rejects a value that is too long', () => {
    expect(nikSchema.safeParse('32010112345678901').success).toBe(false);
  });

  it('rejects a value containing letters', () => {
    expect(nikSchema.safeParse('32010112345678AB').success).toBe(false);
  });
});

describe('bpjsNumberSchema', () => {
  it('accepts exactly 13 digits', () => {
    expect(bpjsNumberSchema.parse('0001234567890')).toBe('0001234567890');
  });

  it('rejects 12 digits', () => {
    expect(bpjsNumberSchema.safeParse('000123456789').success).toBe(false);
  });
});

describe('collectNikDemographicWarnings', () => {
  it('returns nothing when the NIK agrees with birth date and sex', () => {
    expect(
      collectNikDemographicWarnings({
        nik: '3201015205900001',
        dateOfBirth: '1990-05-12',
        sex: 'FEMALE',
      }),
    ).toEqual([]);
  });

  it('reads the +40 day offset as female', () => {
    expect(
      collectNikDemographicWarnings({
        nik: '3201015205900001',
        dateOfBirth: '1990-05-12',
        sex: 'MALE',
      }),
    ).toEqual(['NIK encodes FEMALE but MALE was submitted']);
  });

  it('reads an unoffset day as male', () => {
    expect(
      collectNikDemographicWarnings({
        nik: '3201011205900001',
        dateOfBirth: '1990-05-12',
        sex: 'MALE',
      }),
    ).toEqual([]);
  });

  it('flags a birth date that disagrees with the NIK', () => {
    expect(
      collectNikDemographicWarnings({
        nik: '3201015205900001',
        dateOfBirth: '1991-05-12',
        sex: 'FEMALE',
      }),
    ).toEqual(['NIK encodes a different birth date than the one submitted']);
  });

  it('flags a NIK that encodes an impossible date', () => {
    expect(
      collectNikDemographicWarnings({
        nik: '3201019905900001',
        dateOfBirth: '1990-05-12',
        sex: 'FEMALE',
      }),
    ).toEqual(['NIK does not encode a valid birth date; verify against the KTP']);
  });

  it('returns nothing for a structurally invalid NIK, leaving that to the schema', () => {
    expect(collectNikDemographicWarnings({ nik: '12345' })).toEqual([]);
  });

  it('checks only what was supplied', () => {
    expect(collectNikDemographicWarnings({ nik: '3201015205900001' })).toEqual([]);
  });
});

describe('maskIdentifierLast4', () => {
  it('renders the masked form', () => {
    expect(maskIdentifierLast4('7890')).toBe('••••••••7890');
  });

  it('returns undefined when nothing is on file', () => {
    expect(maskIdentifierLast4(null)).toBeUndefined();
  });
});

describe('createPatientSchema identifiers', () => {
  it('normalises the NIK before it reaches the service', () => {
    const actual = createPatientSchema.parse({
      ...inputBasePatient,
      nik: '3201 0152 0590 0001',
    });
    expect(actual.nik).toBe('3201015205900001');
  });

  it('leaves identifiers optional', () => {
    expect(createPatientSchema.safeParse(inputBasePatient).success).toBe(true);
  });
});

describe('updatePatientSchema identifiers', () => {
  it('accepts null to clear an identifier', () => {
    expect(updatePatientSchema.safeParse({ nik: null }).success).toBe(true);
  });

  it('still rejects a malformed identifier', () => {
    expect(updatePatientSchema.safeParse({ nik: '12345' }).success).toBe(false);
  });
});

describe('patientAllergiesSchema', () => {
  it('accepts a substance with a severity', () => {
    expect(
      patientAllergiesSchema.safeParse([{ substance: 'Penicillin', severity: 'SEVERE' }]).success,
    ).toBe(true);
  });

  it('accepts an empty list, which clears the existing entries', () => {
    expect(patientAllergiesSchema.safeParse([]).success).toBe(true);
  });

  it('rejects a duplicate substance regardless of casing', () => {
    expect(
      patientAllergiesSchema.safeParse([
        { substance: 'Penicillin', severity: 'SEVERE' },
        { substance: 'penicillin', severity: 'MILD' },
      ]).success,
    ).toBe(false);
  });

  it('rejects an unknown severity', () => {
    expect(
      patientAllergiesSchema.safeParse([{ substance: 'Penicillin', severity: 'FATAL' }]).success,
    ).toBe(false);
  });

  it('rejects a substance that is too short', () => {
    expect(patientAllergiesSchema.safeParse([{ substance: 'P', severity: 'MILD' }]).success).toBe(
      false,
    );
  });
});

describe('createPatientSchema demographics', () => {
  it('accepts the recognised Indonesian religion values', () => {
    expect(
      createPatientSchema.safeParse({ ...inputBasePatient, religion: 'KONGHUCU' }).success,
    ).toBe(false);
    expect(
      createPatientSchema.safeParse({ ...inputBasePatient, religion: 'CONFUCIANISM' }).success,
    ).toBe(true);
  });

  it('keeps blood type and rhesus as separate fields', () => {
    const actual = createPatientSchema.parse({
      ...inputBasePatient,
      bloodType: 'O',
      rhesusFactor: 'NEGATIVE',
    });
    expect(actual.bloodType).toBe('O');
    expect(actual.rhesusFactor).toBe('NEGATIVE');
  });

  it('rejects a malformed email', () => {
    expect(createPatientSchema.safeParse({ ...inputBasePatient, email: 'not-an-email' }).success).toBe(
      false,
    );
  });
});
