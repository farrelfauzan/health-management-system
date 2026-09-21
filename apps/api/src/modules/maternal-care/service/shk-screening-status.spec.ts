import {
  ShkScreeningStatusValue,
  computeShkRepeatWindow,
  computeShkSampleWindow,
  isShkSampleEarly,
  resolveShkScreeningStatus,
} from '@hms/shared-types';

/**
 * P25-T10. The SHK window and the status derived from it.
 *
 * The edges are the whole point: a heel prick at 47 h 59 m is too early to
 * read, and at 72 h 1 m the baby is overdue. Both edges are inclusive.
 */
describe('SHK sample window and status (P25-T10)', () => {
  // 1 Oct 2026 03:00 WIB.
  const BIRTH_AT = new Date('2026-09-30T20:00:00.000Z');
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const window = computeShkSampleWindow(BIRTH_AT);

  function statusAt(offsetMs: number): ShkScreeningStatusValue {
    return resolveShkScreeningStatus({
      ...window,
      sampleTakenAt: null,
      sentAt: null,
      resultReceivedAt: null,
      now: new Date(BIRTH_AT.getTime() + offsetMs),
    });
  }

  it('is due 3 Oct 03:00 until 4 Oct 03:00 WIB for a baby born 1 Oct 03:00 WIB', () => {
    expect(window.dueFrom).toEqual(new Date('2026-10-02T20:00:00.000Z'));
    expect(window.dueUntil).toEqual(new Date('2026-10-03T20:00:00.000Z'));
  });

  it.each([
    ['47h59m', 47 * HOUR + 59 * MINUTE, 'UPCOMING'],
    ['48h', 48 * HOUR, 'DUE'],
    ['60h', 60 * HOUR, 'DUE'],
    ['72h', 72 * HOUR, 'DUE'],
    ['72h1m', 72 * HOUR + MINUTE, 'OVERDUE'],
  ])('reads %s after birth as %s', (_label, offsetMs, expectedStatus) => {
    expect(statusAt(offsetMs)).toBe(expectedStatus);
  });

  it.each([
    [{ sampleTakenAt: true, sentAt: false, resultReceivedAt: false }, 'TAKEN'],
    [{ sampleTakenAt: true, sentAt: true, resultReceivedAt: false }, 'SENT'],
    [{ sampleTakenAt: true, sentAt: true, resultReceivedAt: true }, 'RESULTED'],
    [{ sampleTakenAt: true, sentAt: false, resultReceivedAt: true }, 'RESULTED'],
  ])('lets what happened outrank the clock: %o is %s', (steps, expectedStatus) => {
    const lateInstant = new Date(BIRTH_AT.getTime() + 100 * HOUR);
    const actualStatus = resolveShkScreeningStatus({
      ...window,
      sampleTakenAt: steps.sampleTakenAt ? lateInstant : null,
      sentAt: steps.sentAt ? lateInstant : null,
      resultReceivedAt: steps.resultReceivedAt ? lateInstant : null,
      now: new Date(BIRTH_AT.getTime() + 200 * HOUR),
    });

    expect(actualStatus).toBe(expectedStatus);
  });

  it('makes a repeat sample due the moment its result arrives', () => {
    const receivedAt = new Date('2026-10-10T02:00:00.000Z');

    const repeat = computeShkRepeatWindow(receivedAt);

    expect(repeat.dueFrom).toEqual(receivedAt);
    expect(
      resolveShkScreeningStatus({
        ...repeat,
        sampleTakenAt: null,
        sentAt: null,
        resultReceivedAt: null,
        now: receivedAt,
      }),
    ).toBe('DUE');
  });

  it.each([
    ['47h59m', 47 * HOUR + 59 * MINUTE, true],
    ['48h', 48 * HOUR, false],
    ['100h', 100 * HOUR, false],
  ])('flags a heel prick at %s after birth as early: %s', (_label, offsetMs, expected) => {
    expect(
      isShkSampleEarly({ dueFrom: window.dueFrom, sampleTakenAt: new Date(BIRTH_AT.getTime() + offsetMs) }),
    ).toBe(expected);
  });

  it('never flags an untaken sample as early', () => {
    expect(isShkSampleEarly({ dueFrom: window.dueFrom, sampleTakenAt: null })).toBe(false);
  });
});
