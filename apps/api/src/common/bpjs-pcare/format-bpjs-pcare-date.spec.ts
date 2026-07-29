import { formatBpjsPcareDate } from './format-bpjs-pcare-date';

describe('formatBpjsPcareDate', () => {
  it('formats a UTC-midnight calendar day as dd-MM-yyyy', () => {
    expect(formatBpjsPcareDate(new Date('2026-08-05T00:00:00.000Z'))).toBe('05-08-2026');
  });

  it('uses UTC parts so a late-evening UTC timestamp keeps its UTC day', () => {
    expect(formatBpjsPcareDate(new Date('2026-12-31T23:30:00.000Z'))).toBe('31-12-2026');
  });
});
