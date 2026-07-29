import { buildBpjsKunjunganPayload } from './build-bpjs-kunjungan-payload';

describe('buildBpjsKunjunganPayload', () => {
  const inputOptions = {
    noKartu: '0001234567890',
    kdPoli: '001',
    kdDokter: '1234',
    registrationDate: new Date('2026-08-05T00:00:00.000Z'),
    dischargeDate: new Date('2026-08-05T04:30:00.000Z'),
    keluhan: '  Demam tiga hari  ',
    diagnosisCodes: ['A01.0', 'E11', 'I10', 'J06'],
    vitals: {
      systolicBloodPressure: 120,
      diastolicBloodPressure: 80,
      heightCm: 170.4,
      weightKg: 65.6,
      pulseRate: null,
      respiratoryRate: 18,
    },
  };

  it('builds the outpatient kunjungan body with at most three diagnoses', () => {
    const actualPayload = buildBpjsKunjunganPayload(inputOptions);

    expect(actualPayload).toMatchObject({
      noKunjungan: null,
      tglDaftar: '05-08-2026',
      tglPulang: '05-08-2026',
      kdSadar: '01',
      kdStatusPulang: '3',
      kdTkp: '10',
      kdDiag1: 'A01.0',
      kdDiag2: 'E11',
      kdDiag3: 'I10',
      keluhan: 'Demam tiga hari',
      beratBadan: 66,
      tinggiBadan: 170,
      heartRate: 0,
      respRate: 18,
    });
  });

  it('throws when no diagnosis code is provided', () => {
    expect(() =>
      buildBpjsKunjunganPayload({ ...inputOptions, diagnosisCodes: [] }),
    ).toThrow(/at least one diagnosis/);
  });

  it('sends zeros when no vitals were recorded', () => {
    const actualPayload = buildBpjsKunjunganPayload({ ...inputOptions, vitals: null });

    expect(actualPayload.sistole).toBe(0);
    expect(actualPayload.beratBadan).toBe(0);
  });
});
