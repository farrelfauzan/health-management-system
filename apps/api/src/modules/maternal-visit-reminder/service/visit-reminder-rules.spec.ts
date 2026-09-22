import {
  buildVisitReminderMessage,
  doesDueWindowTouchRange,
  isWithinVisitReminderSendWindow,
  listMaternalVisitsDueQuerySchema,
  resolveMaternalDueRange,
  resolveTrimesterWindows,
} from '@hms/shared-types';

describe('visit reminder rules (P25-T17)', () => {
  describe('doesDueWindowTouchRange', () => {
    const range = { from: '2026-10-01', to: '2026-10-07' };

    it('includes a window that opens inside the range', () => {
      expect(
        doesDueWindowTouchRange({ dueFrom: '2026-10-02', dueUntil: '2026-10-20', range }),
      ).toBe(true);
    });

    it('includes a window that closes inside the range', () => {
      expect(
        doesDueWindowTouchRange({ dueFrom: '2026-09-10', dueUntil: '2026-10-01', range }),
      ).toBe(true);
    });

    it('leaves out a window that merely spans the range', () => {
      expect(
        doesDueWindowTouchRange({ dueFrom: '2026-09-20', dueUntil: '2026-10-20', range }),
      ).toBe(false);
    });
  });

  describe('resolveTrimesterWindows', () => {
    it('matches the resolveTrimester boundaries: through week 12, through week 24, to the HPL', () => {
      const actual = resolveTrimesterWindows({
        lastMenstrualPeriodDate: new Date('2026-01-01T00:00:00.000Z'),
        estimatedDeliveryDate: new Date('2026-10-08T00:00:00.000Z'),
      });

      expect(actual).toEqual([
        { trimester: 1, startsOn: '2026-01-01', endsOn: '2026-04-01' },
        { trimester: 2, startsOn: '2026-04-02', endsOn: '2026-06-24' },
        { trimester: 3, startsOn: '2026-06-25', endsOn: '2026-10-08' },
      ]);
    });

    it('counts from the HPL less 280 days when no HPHT was recorded', () => {
      const [actualFirst] = resolveTrimesterWindows({
        lastMenstrualPeriodDate: null,
        estimatedDeliveryDate: new Date('2026-10-08T00:00:00.000Z'),
      });

      expect(actualFirst?.startsOn).toBe('2026-01-01');
    });
  });

  describe('resolveMaternalDueRange', () => {
    it('defaults to today and the six days after', () => {
      expect(resolveMaternalDueRange({ query: {}, clinicToday: '2026-12-29' })).toEqual({
        from: '2026-12-29',
        to: '2027-01-04',
      });
    });

    it('refuses a range longer than 31 days or running backwards', () => {
      expect(
        listMaternalVisitsDueQuerySchema.safeParse({ from: '2026-10-01', to: '2026-11-15' })
          .success,
      ).toBe(false);
      expect(
        listMaternalVisitsDueQuerySchema.safeParse({ from: '2026-10-07', to: '2026-10-01' })
          .success,
      ).toBe(false);
    });
  });

  describe('isWithinVisitReminderSendWindow', () => {
    it('opens at 09:00 clinic time and closes at noon', () => {
      const timeZone = 'Asia/Jakarta';
      expect(
        isWithinVisitReminderSendWindow({ instant: new Date('2026-10-01T01:59:00Z'), timeZone }),
      ).toBe(false);
      expect(
        isWithinVisitReminderSendWindow({ instant: new Date('2026-10-01T02:00:00Z'), timeZone }),
      ).toBe(true);
      expect(
        isWithinVisitReminderSendWindow({ instant: new Date('2026-10-01T05:00:00Z'), timeZone }),
      ).toBe(false);
    });
  });

  describe('buildVisitReminderMessage', () => {
    it('says only that a visit is due, where, and how to stop', () => {
      const actual = buildVisitReminderMessage({
        clinicName: 'Klinik X',
        visits: [{ source: 'POSTNATAL', subject: 'PATIENT' }],
      });

      expect(actual).toContain('Klinik X');
      expect(actual).toContain('kunjungan nifas');
      expect(actual).toContain('minggu ini');
      expect(actual).toContain('BERHENTI');
      expect(actual.length).toBeLessThan(280);
    });
  });
});
