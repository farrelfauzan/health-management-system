import { ClinicalDocumentSignerRecord } from '@hms/shared-types';

import { buildSignerValues } from './build-signer-values';

/**
 * The signature block is the part of a clinical letter a receiving hospital
 * or apotek checks first: who signed, as what, under which licence. D-032
 * fixes the flat profile number as the STR, so the label beside it has to be
 * earned by a practice licence actually on file.
 */
describe('buildSignerValues', () => {
  const asOfDate = '2026-09-25';

  const doctor: ClinicalDocumentSignerRecord = {
    fullName: 'dr. Yusuf Hidayat',
    profession: 'DOCTOR',
    strNumber: 'KK00000000000001',
    practiceLicenses: [],
  };

  const midwife: ClinicalDocumentSignerRecord = {
    fullName: 'Siti Rahma, S.Tr.Keb.',
    profession: 'MIDWIFE',
    strNumber: 'BD00000000000002',
    practiceLicenses: [],
  };

  it('signs a doctor under a SIP in force', () => {
    const actual = buildSignerValues({
      signer: {
        ...doctor,
        practiceLicenses: [
          { licenseNumber: 'SIP-2026-0005', expiresAt: new Date('2031-01-01T00:00:00.000Z') },
        ],
      },
      asOfDate,
    });

    expect(actual).toEqual({
      'doctor.fullName': 'dr. Yusuf Hidayat',
      'doctor.signatureRole': 'Dokter pemeriksa',
      'doctor.licenseLabel': 'SIP',
      'doctor.licenseNumber': 'SIP-2026-0005',
    });
  });

  it('signs a midwife as bidan under her SIPB', () => {
    const actual = buildSignerValues({
      signer: { ...midwife, practiceLicenses: [{ licenseNumber: 'SIPB-77', expiresAt: null }] },
      asOfDate,
    });

    expect(actual['doctor.signatureRole']).toBe('Bidan pemeriksa');
    expect(actual['doctor.licenseLabel']).toBe('SIPB');
    expect(actual['doctor.licenseNumber']).toBe('SIPB-77');
  });

  it('falls back to the STR, labelled as the STR, when no practice licence is on file', () => {
    const actual = buildSignerValues({ signer: midwife, asOfDate });

    expect(actual['doctor.signatureRole']).toBe('Bidan pemeriksa');
    expect(actual['doctor.licenseLabel']).toBe('STR');
    expect(actual['doctor.licenseNumber']).toBe('BD00000000000002');
  });

  // A lapsed SIP is not a licence anybody may sign under; the lifetime STR is
  // at least true.
  it('never prints an expired practice licence', () => {
    const actual = buildSignerValues({
      signer: {
        ...doctor,
        practiceLicenses: [
          { licenseNumber: 'SIP-OLD', expiresAt: new Date('2026-09-24T00:00:00.000Z') },
        ],
      },
      asOfDate,
    });

    expect(actual['doctor.licenseLabel']).toBe('STR');
    expect(actual['doctor.licenseNumber']).toBe('KK00000000000001');
  });

  it('still honours a licence on its last valid day', () => {
    const actual = buildSignerValues({
      signer: {
        ...doctor,
        practiceLicenses: [
          { licenseNumber: 'SIP-LAST-DAY', expiresAt: new Date('2026-09-25T00:00:00.000Z') },
        ],
      },
      asOfDate,
    });

    expect(actual['doctor.licenseNumber']).toBe('SIP-LAST-DAY');
  });

  it('prints dashes rather than blanks when nobody is on record to sign', () => {
    const actual = buildSignerValues({ signer: null, asOfDate });

    expect(actual['doctor.fullName']).toBe('—');
    expect(actual['doctor.licenseNumber']).toBe('—');
    expect(Object.values(actual).every((value) => value !== '')).toBe(true);
  });
});
