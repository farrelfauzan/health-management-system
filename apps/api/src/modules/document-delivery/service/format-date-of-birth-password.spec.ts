import { formatDateOfBirthPassword } from './format-date-of-birth-password';

describe('formatDateOfBirthPassword', () => {
  it('formats 1988-03-07 as 07031988', () => {
    expect(formatDateOfBirthPassword(new Date('1988-03-07T00:00:00.000Z'), 'DOB_DDMMYYYY')).toBe(
      '07031988',
    );
  });

  it('zero-pads a single-digit day and month', () => {
    expect(formatDateOfBirthPassword(new Date('2001-01-09T00:00:00.000Z'), 'DOB_DDMMYYYY')).toBe(
      '09012001',
    );
  });

  it('keeps the last day of the year on the right side of midnight', () => {
    // A date-only column read in a westward local zone would otherwise slip
    // to the 30th; UTC getters are the whole point.
    expect(formatDateOfBirthPassword(new Date('1975-12-31T00:00:00.000Z'), 'DOB_DDMMYYYY')).toBe(
      '31121975',
    );
  });

  it('formats the year-first scheme as YYYYMMDD', () => {
    expect(formatDateOfBirthPassword(new Date('1988-03-07T00:00:00.000Z'), 'DOB_YYYYMMDD')).toBe(
      '19880307',
    );
  });
});
