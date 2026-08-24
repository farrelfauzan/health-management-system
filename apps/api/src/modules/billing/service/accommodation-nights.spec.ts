import { tallyAccommodationNights } from '@hms/shared-types';

/**
 * IMP-15's pricing rule, stated as arithmetic: a night is a clinic-local
 * midnight the patient was in a bed for.
 *
 * All times below are written as UTC instants with Jakarta (UTC+7) in mind —
 * 17:00Z is midnight in the clinic — because that offset is the whole reason
 * the rule cannot be expressed in UTC days.
 */
describe('tallyAccommodationNights', () => {
  const TIME_ZONE = 'Asia/Jakarta';

  // Master-data rows, not enum values — the tally groups by class id, so two
  // intervals in the same class must collapse even though each carries its own
  // (equal but distinct) summary object.
  const KELAS_1 = { id: 'class-k1', code: 'KELAS_1', name: 'Kelas 1' };
  const KELAS_2 = { id: 'class-k2', code: 'KELAS_2', name: 'Kelas 2' };
  const KELAS_3 = { id: 'class-k3', code: 'KELAS_3', name: 'Kelas 3' };
  const VIP = { id: 'class-vip', code: 'VIP', name: 'VIP' };

  it('bills three nights for a three-night stay', () => {
    // Admitted 5 Sept 10:00 local, discharged 8 Sept 17:00 local.
    const actual = tallyAccommodationNights({
      intervals: [
        {
          roomClass: KELAS_1,
          startedAt: new Date('2026-09-05T03:00:00.000Z'),
          endedAt: new Date('2026-09-08T10:00:00.000Z'),
        },
      ],
      timeZone: TIME_ZONE,
    });

    expect(actual).toEqual([{ roomClass: KELAS_1, nights: 3 }]);
  });

  it('crosses a month boundary without noticing there was one', () => {
    // 29 Sept 20:00 local through 2 Oct 09:00 local.
    const actual = tallyAccommodationNights({
      intervals: [
        {
          roomClass: KELAS_2,
          startedAt: new Date('2026-09-29T13:00:00.000Z'),
          endedAt: new Date('2026-10-02T02:00:00.000Z'),
        },
      ],
      timeZone: TIME_ZONE,
    });

    expect(actual).toEqual([{ roomClass: KELAS_2, nights: 3 }]);
  });

  it('splits the nights across a transfer between room classes', () => {
    // Admitted 5 Sept 10:00 local in Kelas 1, moved to VIP on 7 Sept 14:00
    // local, discharged 9 Sept 09:00 local. Midnights: 6th and 7th in Kelas 1,
    // 8th and 9th in VIP.
    const actual = tallyAccommodationNights({
      intervals: [
        {
          roomClass: KELAS_1,
          startedAt: new Date('2026-09-05T03:00:00.000Z'),
          endedAt: new Date('2026-09-07T07:00:00.000Z'),
        },
        {
          roomClass: VIP,
          startedAt: new Date('2026-09-07T07:00:00.000Z'),
          endedAt: new Date('2026-09-09T02:00:00.000Z'),
        },
      ],
      timeZone: TIME_ZONE,
    });

    expect(actual).toEqual([
      { roomClass: KELAS_1, nights: 2 },
      { roomClass: VIP, nights: 2 },
    ]);
  });

  it('never double-bills the day of a transfer', () => {
    const actual = tallyAccommodationNights({
      intervals: [
        {
          roomClass: KELAS_3,
          startedAt: new Date('2026-09-05T03:00:00.000Z'),
          endedAt: new Date('2026-09-06T05:00:00.000Z'),
        },
        {
          roomClass: KELAS_1,
          startedAt: new Date('2026-09-06T05:00:00.000Z'),
          endedAt: new Date('2026-09-07T02:00:00.000Z'),
        },
      ],
      timeZone: TIME_ZONE,
    });

    // Two calendar days were touched twice over, but only two midnights
    // passed: the 6th (Kelas 3) and the 7th (Kelas 1).
    expect(actual).toEqual([
      { roomClass: KELAS_3, nights: 1 },
      { roomClass: KELAS_1, nights: 1 },
    ]);
  });

  it('gives a transfer landing exactly on midnight to the old room', () => {
    // The patient was in the old bed up to that instant, so the night is
    // theirs. A deliberate tie-break, not an accident of comparison.
    const actual = tallyAccommodationNights({
      intervals: [
        {
          roomClass: KELAS_2,
          startedAt: new Date('2026-09-05T03:00:00.000Z'),
          endedAt: new Date('2026-09-05T17:00:00.000Z'),
        },
        {
          roomClass: VIP,
          startedAt: new Date('2026-09-05T17:00:00.000Z'),
          endedAt: new Date('2026-09-06T02:00:00.000Z'),
        },
      ],
      timeZone: TIME_ZONE,
    });

    expect(actual).toEqual([{ roomClass: KELAS_2, nights: 1 }]);
  });

  it('bills nothing for a stay that crosses no midnight', () => {
    // Admitted and discharged the same clinic day. Whether a clinic charges a
    // day rate for that is a tariff policy nobody has stated, so the tally
    // reports the honest zero rather than inventing one.
    const actual = tallyAccommodationNights({
      intervals: [
        {
          roomClass: VIP,
          startedAt: new Date('2026-09-05T03:00:00.000Z'),
          endedAt: new Date('2026-09-05T09:00:00.000Z'),
        },
      ],
      timeZone: TIME_ZONE,
    });

    expect(actual).toEqual([]);
  });

  it('bills nothing for a stay with no closed assignment', () => {
    expect(tallyAccommodationNights({ intervals: [], timeZone: TIME_ZONE })).toEqual([]);
  });

  it('reads midnight in the clinic zone, not in UTC', () => {
    // 5 Sept 22:00 Jakarta to 6 Sept 02:00 Jakarta is one night locally —
    // and would be *zero* if the boundary were read in UTC, where both
    // instants fall on the 5th.
    const actual = tallyAccommodationNights({
      intervals: [
        {
          roomClass: KELAS_1,
          startedAt: new Date('2026-09-05T15:00:00.000Z'),
          endedAt: new Date('2026-09-05T19:00:00.000Z'),
        },
      ],
      timeZone: TIME_ZONE,
    });

    expect(actual).toEqual([{ roomClass: KELAS_1, nights: 1 }]);
  });

  it('collapses two separate stretches in the same class into one tally', () => {
    // A patient moved out to VIP and back. The class is master data, so both
    // Kelas 1 stretches carry equal-but-distinct summary objects — grouping by
    // identity rather than by id would bill the same class twice.
    const actual = tallyAccommodationNights({
      intervals: [
        {
          roomClass: { ...KELAS_1 },
          startedAt: new Date('2026-09-05T03:00:00.000Z'),
          endedAt: new Date('2026-09-06T07:00:00.000Z'),
        },
        {
          roomClass: VIP,
          startedAt: new Date('2026-09-06T07:00:00.000Z'),
          endedAt: new Date('2026-09-07T07:00:00.000Z'),
        },
        {
          roomClass: { ...KELAS_1 },
          startedAt: new Date('2026-09-07T07:00:00.000Z'),
          endedAt: new Date('2026-09-09T02:00:00.000Z'),
        },
      ],
      timeZone: TIME_ZONE,
    });

    expect(actual).toEqual([
      { roomClass: KELAS_1, nights: 3 },
      { roomClass: VIP, nights: 1 },
    ]);
  });
});
