import {
  buildPostnatalVisitWindows,
  PostnatalVisitCodeValue,
  PostnatalVisitWindow,
  resolvePostnatalVisitCode,
  resolvePostnatalWindowStatus,
} from '@hms/shared-types';

const CLINIC_TIME_ZONE = 'Asia/Jakarta';

/** Writes a Jakarta wall-clock time as the instant it is. */
function wib(localDateTime: string): Date {
  return new Date(`${localDateTime}+07:00`);
}

type WindowRow = {
  code: PostnatalVisitCodeValue;
  startsAt: string;
  endsAt: string;
};

/**
 * The window table (P25-T12). Hour bounds are absolute offsets from the birth;
 * day bounds are whole clinic-local calendar days with the birth date as
 * day 0. Each birth is checked on every window's first and last instant, and
 * on the millisecond either side.
 */
describe('postnatal visit windows', () => {
  describe.each<{ label: string; birthAt: Date; rows: WindowRow[] }>([
    {
      // The ticket's acceptance birth.
      label: 'a birth at 03:00 WIB on 1 October',
      birthAt: wib('2026-10-01T03:00:00.000'),
      rows: [
        { code: 'KF1', startsAt: '2026-10-01T09:00:00.000', endsAt: '2026-10-03T23:59:59.999' },
        { code: 'KF2', startsAt: '2026-10-04T00:00:00.000', endsAt: '2026-10-08T23:59:59.999' },
        { code: 'KF3', startsAt: '2026-10-09T00:00:00.000', endsAt: '2026-10-29T23:59:59.999' },
        { code: 'KF4', startsAt: '2026-10-30T00:00:00.000', endsAt: '2026-11-12T23:59:59.999' },
        { code: 'KN1', startsAt: '2026-10-01T09:00:00.000', endsAt: '2026-10-03T03:00:00.000' },
        { code: 'KN2', startsAt: '2026-10-04T00:00:00.000', endsAt: '2026-10-08T23:59:59.999' },
        { code: 'KN3', startsAt: '2026-10-09T00:00:00.000', endsAt: '2026-10-29T23:59:59.999' },
      ],
    },
    {
      // 16:30 UTC — still 1 October in Jakarta, so day 0 is the 1st.
      label: 'a birth at 23:30 WIB',
      birthAt: wib('2026-10-01T23:30:00.000'),
      rows: [
        { code: 'KF1', startsAt: '2026-10-02T05:30:00.000', endsAt: '2026-10-03T23:59:59.999' },
        { code: 'KF2', startsAt: '2026-10-04T00:00:00.000', endsAt: '2026-10-08T23:59:59.999' },
        { code: 'KF3', startsAt: '2026-10-09T00:00:00.000', endsAt: '2026-10-29T23:59:59.999' },
        { code: 'KF4', startsAt: '2026-10-30T00:00:00.000', endsAt: '2026-11-12T23:59:59.999' },
        { code: 'KN1', startsAt: '2026-10-02T05:30:00.000', endsAt: '2026-10-03T23:30:00.000' },
        { code: 'KN2', startsAt: '2026-10-04T00:00:00.000', endsAt: '2026-10-08T23:59:59.999' },
        { code: 'KN3', startsAt: '2026-10-09T00:00:00.000', endsAt: '2026-10-29T23:59:59.999' },
      ],
    },
    {
      // 17:30 UTC on 1 October, but 2 October in Jakarta: day 0 is the 2nd,
      // which a UTC calendar would get wrong by a whole day.
      label: 'a birth at 00:30 WIB',
      birthAt: wib('2026-10-02T00:30:00.000'),
      rows: [
        { code: 'KF1', startsAt: '2026-10-02T06:30:00.000', endsAt: '2026-10-04T23:59:59.999' },
        { code: 'KF2', startsAt: '2026-10-05T00:00:00.000', endsAt: '2026-10-09T23:59:59.999' },
        { code: 'KF3', startsAt: '2026-10-10T00:00:00.000', endsAt: '2026-10-30T23:59:59.999' },
        { code: 'KF4', startsAt: '2026-10-31T00:00:00.000', endsAt: '2026-11-13T23:59:59.999' },
        { code: 'KN1', startsAt: '2026-10-02T06:30:00.000', endsAt: '2026-10-04T00:30:00.000' },
        { code: 'KN2', startsAt: '2026-10-05T00:00:00.000', endsAt: '2026-10-09T23:59:59.999' },
        { code: 'KN3', startsAt: '2026-10-10T00:00:00.000', endsAt: '2026-10-30T23:59:59.999' },
      ],
    },
  ])('$label', ({ birthAt, rows }) => {
    const windows = buildPostnatalVisitWindows({ birthAt, timeZone: CLINIC_TIME_ZONE });

    it.each(rows)('bounds $code', ({ code, startsAt, endsAt }) => {
      const actualWindow = windows.find((window) => window.code === code);

      expect(actualWindow?.startsAt).toEqual(wib(startsAt));
      expect(actualWindow?.endsAt).toEqual(wib(endsAt));
    });

    it.each(rows)(
      'earns $code on its first and last instant, and not a millisecond outside',
      ({ code, startsAt, endsAt }) => {
        const subject = code.startsWith('KF') ? 'MOTHER' : 'NEWBORN';
        const resolveAt = (visitedAt: Date) =>
          resolvePostnatalVisitCode({ birthAt, visitedAt, subject, timeZone: CLINIC_TIME_ZONE });
        const first = wib(startsAt);
        const last = wib(endsAt);

        expect(resolveAt(first)).toBe(code);
        expect(resolveAt(last)).toBe(code);
        expect(resolveAt(new Date(first.getTime() - 1))).not.toBe(code);
        expect(resolveAt(new Date(last.getTime() + 1))).not.toBe(code);
      },
    );
  });

  it('puts a baby seen between 48 hours and day 3 outside every window', () => {
    const birthAt = wib('2026-10-01T03:00:00.000');
    const inTheGap = wib('2026-10-03T12:00:00.000');

    expect(
      resolvePostnatalVisitCode({
        birthAt,
        visitedAt: inTheGap,
        subject: 'NEWBORN',
        timeZone: CLINIC_TIME_ZONE,
      }),
    ).toBeNull();
    // The same moment is still KF1 for the mother, whose window ends with day 2.
    expect(
      resolvePostnatalVisitCode({
        birthAt,
        visitedAt: inTheGap,
        subject: 'MOTHER',
        timeZone: CLINIC_TIME_ZONE,
      }),
    ).toBe('KF1');
  });

  it('codes nothing in the first six hours or after the last window', () => {
    const birthAt = wib('2026-10-01T03:00:00.000');
    const resolveMother = (visitedAt: Date) =>
      resolvePostnatalVisitCode({
        birthAt,
        visitedAt,
        subject: 'MOTHER',
        timeZone: CLINIC_TIME_ZONE,
      });

    expect(resolveMother(wib('2026-10-01T05:00:00.000'))).toBeNull();
    expect(resolveMother(wib('2026-11-13T00:00:00.000'))).toBeNull();
  });

  it('reads a window as UPCOMING, DUE, MISSED or FULFILLED', () => {
    const kf1 = buildPostnatalVisitWindows({
      birthAt: wib('2026-10-01T03:00:00.000'),
      timeZone: CLINIC_TIME_ZONE,
    })[0] as PostnatalVisitWindow;
    const statusAt = (asOf: string, isFulfilled = false) =>
      resolvePostnatalWindowStatus({ window: kf1, isFulfilled, asOf: wib(asOf) });

    expect(statusAt('2026-10-01T08:59:59.999')).toBe('UPCOMING');
    expect(statusAt('2026-10-02T12:00:00.000')).toBe('DUE');
    expect(statusAt('2026-10-04T00:00:00.000')).toBe('MISSED');
    expect(statusAt('2026-10-04T00:00:00.000', true)).toBe('FULFILLED');
  });
});
