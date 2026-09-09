import { CheckInPracticeWindow, resolveCheckInWindow } from '@hms/shared-types';

describe('resolveCheckInWindow', () => {
  const timeZone = 'Asia/Jakarta';
  const graceMinutes = 60;

  const afternoonSession: CheckInPracticeWindow = {
    date: '2026-07-18',
    startTime: '14:00',
    endTime: '17:00',
    kind: 'SESSION',
  };

  function decideAt(instant: string, windows: CheckInPracticeWindow[] = [afternoonSession]) {
    return resolveCheckInWindow({
      windows,
      now: new Date(instant),
      timeZone,
      graceMinutes,
    });
  }

  it('allows a check-in inside the session', () => {
    // 15:00 Asia/Jakarta.
    const actualDecision = decideAt('2026-07-18T08:00:00.000Z');

    expect(actualDecision).toEqual({
      allowed: true,
      reason: 'INSIDE',
      sessionStart: '14:00',
      sessionEnd: '17:00',
      opensAt: '13:00',
      closesAt: '17:00',
    });
  });

  it('allows a check-in exactly when the grace opens', () => {
    // 13:00 Asia/Jakarta, the first minute of the hour of grace.
    expect(decideAt('2026-07-18T06:00:00.000Z').allowed).toBe(true);
  });

  it('refuses a check-in one minute before the grace opens', () => {
    const actualDecision = decideAt('2026-07-18T05:59:00.000Z');

    expect(actualDecision.allowed).toBe(false);
    expect(actualDecision.reason).toBe('BEFORE_OPENING');
    expect(actualDecision.opensAt).toBe('13:00');
  });

  it('allows a check-in in the closing minute and refuses the next', () => {
    expect(decideAt('2026-07-18T10:00:00.000Z').allowed).toBe(true);
    expect(decideAt('2026-07-18T10:01:00.000Z').reason).toBe('AFTER_END');
  });

  it('reports no session when the doctor holds no window that clinic day', () => {
    expect(decideAt('2026-07-19T08:00:00.000Z')).toEqual({
      allowed: false,
      reason: 'NO_SESSION',
    });
  });

  /**
   * The regression this function exists for: on a UTC host, 01:30 UTC on 18
   * July is already 08:30 in Jakarta, and a naive comparison against an 08:00
   * session would place it seven hours before opening.
   */
  it('evaluates an 08:00 Asia/Jakarta session correctly from a UTC host', () => {
    const morningSession: CheckInPracticeWindow = {
      date: '2026-07-18',
      startTime: '08:00',
      endTime: '11:00',
      kind: 'SESSION',
    };

    expect(decideAt('2026-07-18T01:30:00.000Z', [morningSession]).allowed).toBe(true);
    // 17:30 UTC on the 17th is 00:30 on the 18th in Jakarta: the right day,
    // and far too early.
    expect(decideAt('2026-07-17T17:30:00.000Z', [morningSession]).reason).toBe('BEFORE_OPENING');
    // 16:30 UTC on the 17th is still the 17th in Jakarta, a day with no window.
    expect(decideAt('2026-07-17T16:30:00.000Z', [morningSession]).reason).toBe('NO_SESSION');
  });

  it('picks the window the moment falls in when a doctor runs two', () => {
    const morningSession: CheckInPracticeWindow = {
      date: '2026-07-18',
      startTime: '08:00',
      endTime: '11:00',
      kind: 'SESSION',
    };

    // 15:00 Jakarta: past the morning, inside the afternoon.
    const actualDecision = decideAt('2026-07-18T08:00:00.000Z', [afternoonSession, morningSession]);

    expect(actualDecision.allowed).toBe(true);
    expect(actualDecision.sessionStart).toBe('14:00');
  });

  it('quotes the next window when a doctor runs two and neither is open yet', () => {
    const eveningSession: CheckInPracticeWindow = {
      date: '2026-07-18',
      startTime: '19:00',
      endTime: '21:00',
      kind: 'SESSION',
    };

    // 11:30 Jakarta: the afternoon session is next, not the evening one.
    const actualDecision = decideAt('2026-07-18T04:30:00.000Z', [eveningSession, afternoonSession]);

    expect(actualDecision.reason).toBe('BEFORE_OPENING');
    expect(actualDecision.sessionStart).toBe('14:00');
  });

  it('gives an exact-time special request grace on both sides', () => {
    const approvedTime: CheckInPracticeWindow = {
      date: '2026-07-18',
      startTime: '09:00',
      endTime: '09:00',
      kind: 'SPECIAL_REQUEST',
    };

    // 09:45 Jakarta, three quarters of an hour late.
    expect(decideAt('2026-07-18T02:45:00.000Z', [approvedTime]).allowed).toBe(true);
    // 10:01, past the hour of grace.
    expect(decideAt('2026-07-18T03:01:00.000Z', [approvedTime]).reason).toBe('AFTER_END');
    expect(decideAt('2026-07-18T02:45:00.000Z', [approvedTime]).closesAt).toBe('10:00');
  });

  it('clamps an opening time the grace would push past midnight', () => {
    const earlySession: CheckInPracticeWindow = {
      date: '2026-07-18',
      startTime: '00:30',
      endTime: '03:00',
      kind: 'SESSION',
    };

    expect(decideAt('2026-07-17T17:35:00.000Z', [earlySession]).opensAt).toBe('00:00');
  });

  it('honours a zero grace', () => {
    const actualDecision = resolveCheckInWindow({
      windows: [afternoonSession],
      // 13:59 Jakarta.
      now: new Date('2026-07-18T06:59:00.000Z'),
      timeZone,
      graceMinutes: 0,
    });

    expect(actualDecision.reason).toBe('BEFORE_OPENING');
    expect(actualDecision.opensAt).toBe('14:00');
  });
});
