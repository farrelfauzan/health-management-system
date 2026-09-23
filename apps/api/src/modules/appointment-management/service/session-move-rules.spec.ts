import {
  doSessionWindowsOverlap,
  getCalendarWeekBounds,
  isSameCalendarWeek,
  partitionSessionMoveBookings,
} from '@hms/shared-types';

describe('session move rules (P28-T04)', () => {
  describe('getCalendarWeekBounds', () => {
    it.each([
      ['2026-09-28', '2026-09-28', '2026-10-04'],
      ['2026-10-01', '2026-09-28', '2026-10-04'],
      ['2026-10-04', '2026-09-28', '2026-10-04'],
    ])('puts %s in the Monday-Sunday week %s..%s', (inputDate, expectedMonday, expectedSunday) => {
      expect(getCalendarWeekBounds(inputDate)).toEqual({
        monday: expectedMonday,
        sunday: expectedSunday,
      });
    });
  });

  describe('isSameCalendarWeek', () => {
    it('accepts Monday to Sunday of one week', () => {
      expect(isSameCalendarWeek('2026-09-28', '2026-10-04')).toBe(true);
    });

    it('refuses the next Monday', () => {
      expect(isSameCalendarWeek('2026-10-04', '2026-10-05')).toBe(false);
    });
  });

  describe('doSessionWindowsOverlap', () => {
    it('treats touching windows as not overlapping', () => {
      expect(
        doSessionWindowsOverlap(
          { startTime: '08:00', endTime: '10:00' },
          { startTime: '10:00', endTime: '12:00' },
        ),
      ).toBe(false);
    });

    it('detects a partial overlap', () => {
      expect(
        doSessionWindowsOverlap(
          { startTime: '08:00', endTime: '10:00' },
          { startTime: '09:00', endTime: '11:00' },
        ),
      ).toBe(true);
    });
  });

  describe('partitionSessionMoveBookings', () => {
    const inputBookings = [
      { appointmentId: 'plain', bpjsBookingCode: null, hasLiveRegistration: false },
      { appointmentId: 'registered', bpjsBookingCode: null, hasLiveRegistration: true },
      { appointmentId: 'bpjs', bpjsBookingCode: 'K-1', hasLiveRegistration: false },
    ];

    it('moves everybody within the same day', () => {
      expect(partitionSessionMoveBookings({ bookings: inputBookings, isSameDay: true })).toEqual({
        movableIds: ['plain', 'registered', 'bpjs'],
        blocked: [],
      });
    });

    it('leaves registered and BPJS bookings behind on another day', () => {
      expect(partitionSessionMoveBookings({ bookings: inputBookings, isSameDay: false })).toEqual({
        movableIds: ['plain'],
        blocked: [
          { appointmentId: 'registered', reason: 'REGISTERED' },
          { appointmentId: 'bpjs', reason: 'BPJS_BOOKING' },
        ],
      });
    });
  });
});
