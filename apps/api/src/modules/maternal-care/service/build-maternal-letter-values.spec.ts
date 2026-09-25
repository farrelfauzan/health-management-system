import {
  ClinicalDocumentSignerRecord,
  ClinicLetterhead,
  PregnancyEpisodeRecord,
} from '@hms/shared-types';

import { buildMaternalLetterValues } from './build-maternal-letter-values';

/**
 * The values both maternal letters print. Before this, neither letter was
 * handed the clinic profile or the issuing clinician, so the surat rujukan
 * printed an empty letterhead and an unsigned "Dokter pemeriksa" block.
 */
describe('buildMaternalLetterValues', () => {
  const letterhead: ClinicLetterhead = {
    name: 'Klinik Bidan Sehat',
    legalName: null,
    address: 'Jl. Merdeka No. 12, Bandung',
    phoneNumber: '62221234567',
    email: null,
    licenseNumber: '440/1234/DPMPTSP',
    taxId: null,
    logoDataUri: null,
  };

  const midwife: ClinicalDocumentSignerRecord = {
    fullName: 'Siti Rahma, S.Tr.Keb.',
    profession: 'MIDWIFE',
    strNumber: 'BD00000000000002',
    practiceLicenses: [],
  };

  const episode: PregnancyEpisodeRecord = {
    id: 'episode-1',
    patientId: 'patient-1',
    status: 'ACTIVE',
    lastMenstrualPeriodDate: new Date('2026-02-02T00:00:00.000Z'),
    estimatedDeliveryDate: new Date('2026-11-09T00:00:00.000Z'),
    eddSource: 'LMP',
    gravida: 2,
    para: 1,
    abortus: 0,
    prePregnancyWeightKg: null,
    bloodType: null,
    rhesus: null,
    riskNotes: null,
    endedAt: null,
    endReason: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
  };

  function build(
    overrides: Partial<Parameters<typeof buildMaternalLetterValues>[0]> = {},
  ): Record<string, string> {
    return buildMaternalLetterValues({
      patient: {
        fullName: 'Rina Wijaya',
        mrn: '00000447',
        dateOfBirth: new Date('1995-04-12T00:00:00.000Z'),
        sex: 'FEMALE',
        address: null,
        nikLast4: '3204',
      },
      episode,
      asOf: new Date('2026-09-24T17:30:00.000Z'),
      examination: null,
      vitals: { systolicBloodPressure: null, diastolicBloodPressure: null },
      triggeredRules: [],
      letterhead,
      signer: midwife,
      timeZone: 'Asia/Jakarta',
      ...overrides,
    });
  }

  it('fills the letterhead from the clinic profile', () => {
    const actual = build();

    expect(actual['clinic.name']).toBe('Klinik Bidan Sehat');
    expect(actual['clinic.address']).toBe('Jl. Merdeka No. 12, Bandung');
    expect(actual['clinic.phone']).toBe('+62 2212-3456-7');
    expect(actual['clinic.licenseNumber']).toBe('440/1234/DPMPTSP');
  });

  it('signs as the issuing midwife, under her STR when no SIPB is on file', () => {
    const actual = build();

    expect(actual['doctor.fullName']).toBe('Siti Rahma, S.Tr.Keb.');
    expect(actual['doctor.signatureRole']).toBe('Bidan pemeriksa');
    expect(actual['doctor.licenseLabel']).toBe('STR');
    expect(actual['doctor.licenseNumber']).toBe('BD00000000000002');
  });

  it('writes dates out in Indonesian, the issue date on the clinic calendar', () => {
    const actual = build();

    expect(actual['request.issuedAt']).toBe('25 September 2026');
    expect(actual['patient.dateOfBirth']).toBe('12 April 1995');
    expect(actual['pregnancy.lastMenstrualPeriodDate']).toBe('2 Februari 2026');
    expect(actual['pregnancy.estimatedDeliveryDate']).toBe('9 November 2026');
  });

  it('prints a dash, not a guessed sex or a blank, for what the record does not hold', () => {
    const actual = build({
      patient: {
        fullName: 'Rina Wijaya',
        mrn: '00000447',
        dateOfBirth: null,
        sex: null,
        address: null,
        nikLast4: null,
      },
    });

    expect(actual['patient.sex']).toBe('—');
    expect(actual['patient.dateOfBirth']).toBe('—');
    expect(actual['patient.address']).toBe('—');
    expect(actual['patient.nikMasked']).toBe('—');
  });

  it('leaves no token empty', () => {
    const actual = build();

    expect(
      Object.entries(actual).filter(([token, value]) => token !== 'clinic.logo' && value === ''),
    ).toEqual([
      ['clinic.legalName', ''],
      ['clinic.email', ''],
      ['clinic.taxId', ''],
    ]);
  });
});
