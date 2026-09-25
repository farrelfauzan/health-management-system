import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { collectNikDemographicWarnings, nikSchema } from '@hms/shared-types';

import { DEMO_CLINICIAN_FIXTURES } from './demo-clinician-fixtures';
import { DEMO_PATIENT_FIXTURES } from './demo-patient-fixtures';

const SATUSEHAT_FIXTURE_DIRECTORY = join(__dirname, '../modules/satusehat/fixtures');
const SIXTEEN_DIGITS = /\b\d{16}\b/g;

/** Every 16-digit number in the SATUSEHAT fixture sources, whatever export it sits in. */
function readSandboxIdentifiers(): Set<string> {
  const identifiers = new Set<string>();
  readdirSync(SATUSEHAT_FIXTURE_DIRECTORY)
    .filter((fileName) => fileName.endsWith('.ts'))
    .forEach((fileName) => {
      const source = readFileSync(join(SATUSEHAT_FIXTURE_DIRECTORY, fileName), 'utf8');
      (source.match(SIXTEEN_DIGITS) ?? []).forEach((match) => identifiers.add(match));
    });
  return identifiers;
}

describe('demo identity fixtures', () => {
  const inputNiks = [
    ...DEMO_PATIENT_FIXTURES.map((patient) => patient.nik),
    ...DEMO_CLINICIAN_FIXTURES.map((clinician) => clinician.nik),
  ];

  it('reads the sandbox identities it guards against', () => {
    const actualIdentifiers = readSandboxIdentifiers();
    expect(actualIdentifiers.has('9271060312000002')).toBe(true);
    expect(actualIdentifiers.has('3313096403900009')).toBe(true);
  });

  it('never reuses a SATUSEHAT sandbox NIK', () => {
    const sandboxIdentifiers = readSandboxIdentifiers();
    const actualCollisions = inputNiks.filter((nik) => sandboxIdentifiers.has(nik));
    expect(actualCollisions).toEqual([]);
  });

  it('gives every demo person a distinct NIK', () => {
    expect(new Set(inputNiks).size).toBe(inputNiks.length);
  });

  it('uses NIKs the registration form accepts', () => {
    inputNiks.forEach((nik) => expect(nikSchema.safeParse(nik).success).toBe(true));
  });

  /** A mismatch would put a "verify against the KTP" warning in front of the presenter. */
  it('encodes each patient birth date and sex into the NIK the way a KTP does', () => {
    DEMO_PATIENT_FIXTURES.forEach((patient) => {
      const actualWarnings = collectNikDemographicWarnings({
        nik: patient.nik,
        dateOfBirth: patient.dateOfBirth,
        sex: patient.sex,
      });
      expect(actualWarnings).toEqual([]);
    });
  });

  it('places each patient NIK in the district of the patient address', () => {
    DEMO_PATIENT_FIXTURES.forEach((patient) => {
      const expectedPrefix = patient.villageCode.split('.').slice(0, 3).join('');
      expect(patient.nik.slice(0, 6)).toBe(expectedPrefix);
    });
  });

  it('includes a pregnant patient assigned to the midwife', () => {
    const actualMidwifePatients = DEMO_PATIENT_FIXTURES.filter((patient) =>
      patient.clinicianProfessions.includes('MIDWIFE'),
    );
    expect(actualMidwifePatients).toHaveLength(1);
    expect(actualMidwifePatients[0]?.sex).toBe('FEMALE');
  });
});
