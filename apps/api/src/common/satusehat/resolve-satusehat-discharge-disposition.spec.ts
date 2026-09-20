import { resolveSatusehatDischargeDisposition } from './resolve-satusehat-discharge-disposition';

const HL7_SYSTEM = 'http://terminology.hl7.org/CodeSystem/discharge-disposition';
const KEMKES_SYSTEM = 'http://terminology.kemkes.go.id/CodeSystem/discharge-disposition';
const admittedAt = new Date('2026-07-28T02:30:00.000Z');

describe('resolveSatusehatDischargeDisposition', () => {
  it.each([
    ['HOME', 'home'],
    ['AGAINST_ADVICE', 'aadvice'],
    ['REFERRED', 'other-hcf'],
    ['OTHER', 'oth'],
  ] as const)('sends %s as %s from the HL7 list', (disposition, expectedCode) => {
    const actual = resolveSatusehatDischargeDisposition({
      disposition,
      admittedAt,
      dischargedAt: new Date('2026-07-30T04:00:00.000Z'),
    });

    expect(actual.system).toBe(HL7_SYSTEM);
    expect(actual.code).toBe(expectedCode);
  });

  it('keeps reporting a stay with no recorded disposition as home (D-030)', () => {
    const actual = resolveSatusehatDischargeDisposition({
      disposition: null,
      admittedAt,
      dischargedAt: new Date('2026-07-30T04:00:00.000Z'),
    });

    expect(actual).toEqual({ system: HL7_SYSTEM, code: 'home', display: 'Home' });
  });

  it('codes a death within 48 hours as exp-lt48h', () => {
    const actual = resolveSatusehatDischargeDisposition({
      disposition: 'DIED',
      admittedAt,
      // 47h30m after admission.
      dischargedAt: new Date('2026-07-30T02:00:00.000Z'),
    });

    expect(actual.system).toBe(KEMKES_SYSTEM);
    expect(actual.code).toBe('exp-lt48h');
  });

  it('codes a death after 48 hours as exp-gt48h', () => {
    const actual = resolveSatusehatDischargeDisposition({
      disposition: 'DIED',
      admittedAt,
      // 48h30m after admission.
      dischargedAt: new Date('2026-07-30T03:00:00.000Z'),
    });

    expect(actual.system).toBe(KEMKES_SYSTEM);
    expect(actual.code).toBe('exp-gt48h');
  });

  it('treats exactly 48 hours as the longer stay, not the shorter one', () => {
    const actual = resolveSatusehatDischargeDisposition({
      disposition: 'DIED',
      admittedAt,
      dischargedAt: new Date('2026-07-30T02:30:00.000Z'),
    });

    expect(actual.code).toBe('exp-gt48h');
  });
});
