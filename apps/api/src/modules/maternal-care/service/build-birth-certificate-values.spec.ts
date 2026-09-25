import { BirthCertificateSubject, ClinicLetterhead } from '@hms/shared-types';

import { buildBirthCertificateValues } from './build-birth-certificate-values';

/**
 * The surat keterangan lahir is what a family takes to the dukcapil counter.
 * Its letterhead and its place of birth were never filled, so it printed a
 * blank header and "Tempat kelahiran : , ".
 */
describe('buildBirthCertificateValues', () => {
  const letterhead: ClinicLetterhead = {
    name: 'Klinik Bidan Sehat',
    legalName: null,
    address: 'Jl. Merdeka No. 12, Bandung',
    phoneNumber: '(022) 1234567',
    email: null,
    licenseNumber: '440/1234/DPMPTSP',
    taxId: null,
    logoDataUri: null,
  };

  const subject: BirthCertificateSubject = {
    motherName: 'Rina Wijaya',
    motherNikLast4: '3204',
    babyName: 'Bayi Ny. Rina',
    sex: 'FEMALE',
    // 03:10 WIB on 9 November, which is 8 November in UTC.
    birthAt: new Date('2026-11-08T20:10:00.000Z'),
    birthWeightGrams: 3200,
    lengthCm: 49,
    birthOrder: 2,
    attendantName: 'Siti Rahma, S.Tr.Keb.',
    attendantStrNumber: 'BD00000000000002',
  };

  it('fills the letterhead and the place of birth from the clinic profile', () => {
    const actual = buildBirthCertificateValues({ subject, letterhead, timeZone: 'Asia/Jakarta' });

    expect(actual['clinic.name']).toBe('Klinik Bidan Sehat');
    expect(actual['clinic.phone']).toBe('(022) 1234567');
    expect(actual['birth.place']).toBe('Klinik Bidan Sehat, Jl. Merdeka No. 12, Bandung');
  });

  it('prints the clinic name alone when no address is on file, never a dangling comma', () => {
    const actual = buildBirthCertificateValues({
      subject,
      letterhead: { ...letterhead, address: null },
      timeZone: 'Asia/Jakarta',
    });

    expect(actual['birth.place']).toBe('Klinik Bidan Sehat');
  });

  it('dates the birth by the clinic calendar, with its weekday', () => {
    const actual = buildBirthCertificateValues({ subject, letterhead, timeZone: 'Asia/Jakarta' });

    expect(actual['baby.birthDate']).toBe('Senin, 9 November 2026');
    expect(actual['baby.birthTime']).toBe('03:10');
  });
});
