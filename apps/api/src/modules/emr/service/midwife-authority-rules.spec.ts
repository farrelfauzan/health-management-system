import {
  isChildVisitPurposeRequired,
  resolveMidwifeProcedureAuthorityKind,
  toPatientAgeInDays,
  toPatientAgeInMonths,
} from '@hms/shared-types';

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

describe('toPatientAgeInMonths', () => {
  it.each([
    ['2021-09-15', '2026-09-14', 59],
    ['2021-09-15', '2026-09-15', 60],
    ['2026-01-31', '2026-02-27', 0],
    ['2026-01-31', '2026-02-28', 1],
    ['2026-01-31', '2026-03-30', 1],
    ['2026-01-31', '2026-03-31', 2],
    ['2024-01-31', '2024-02-29', 1],
    ['2024-02-29', '2025-02-28', 12],
    ['2024-02-29', '2025-02-27', 11],
    ['2024-02-29', '2028-02-29', 48],
    ['2026-09-15', '2026-09-15', 0],
  ])('born %s is %i months old on %s', (inputDateOfBirth, inputAsOf, expectedMonths) => {
    const actual = toPatientAgeInMonths({
      dateOfBirth: toDate(inputDateOfBirth),
      asOf: toDate(inputAsOf),
    });

    expect(actual).toBe(expectedMonths);
  });

  it('never returns a negative age for a birth date after asOf', () => {
    const actual = toPatientAgeInMonths({
      dateOfBirth: toDate('2026-10-01'),
      asOf: toDate('2026-09-15'),
    });

    expect(actual).toBe(0);
  });
});

describe('toPatientAgeInDays', () => {
  it.each([
    ['2026-09-15', '2026-09-15', 0],
    ['2026-08-18', '2026-09-15', 28],
    ['2026-08-17', '2026-09-15', 29],
    ['2024-02-28', '2024-03-01', 2],
  ])('born %s is %i days old on %s', (inputDateOfBirth, inputAsOf, expectedDays) => {
    const actual = toPatientAgeInDays({
      dateOfBirth: toDate(inputDateOfBirth),
      asOf: toDate(inputAsOf),
    });

    expect(actual).toBe(expectedDays);
  });
});

describe('isChildVisitPurposeRequired', () => {
  const asOf = toDate('2026-09-15');

  it('asks a midwife about a child of 59 months', () => {
    const actual = isChildVisitPurposeRequired({
      profession: 'MIDWIFE',
      dateOfBirth: toDate('2021-09-16'),
      asOf,
    });

    expect(actual).toBe(true);
  });

  it('does not ask a midwife about a child of exactly 60 months', () => {
    const actual = isChildVisitPurposeRequired({
      profession: 'MIDWIFE',
      dateOfBirth: toDate('2021-09-15'),
      asOf,
    });

    expect(actual).toBe(false);
  });

  it('never asks a doctor', () => {
    const actual = isChildVisitPurposeRequired({
      profession: 'DOCTOR',
      dateOfBirth: toDate('2026-09-10'),
      asOf,
    });

    expect(actual).toBe(false);
  });
});

describe('resolveMidwifeProcedureAuthorityKind', () => {
  it.each(['69.7', '97.71', ' 69.7 '])('gates %p behind IUD_IMPLANT', (inputCode) => {
    const actual = resolveMidwifeProcedureAuthorityKind({ code: inputCode });

    expect(actual).toBe('IUD_IMPLANT');
  });

  it.each(['99.23', '97.89', '86.05', '86.09', '99.24', '69.70', '69'])(
    'does not gate %p',
    (inputCode) => {
      const actual = resolveMidwifeProcedureAuthorityKind({ code: inputCode });

      expect(actual).toBeNull();
    },
  );

  it.each(['INSERTION', 'REMOVAL'] as const)(
    'gates an implant %s whatever the code',
    (inputAction) => {
      const actual = resolveMidwifeProcedureAuthorityKind({
        code: '99.23',
        contraceptiveImplantAction: inputAction,
      });

      expect(actual).toBe('IUD_IMPLANT');
    },
  );
});
