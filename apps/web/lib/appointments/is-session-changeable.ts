import type { DoctorSessionCalendarItem } from '@hms/shared-types';

/** Only an open or closed occurrence can still be moved or cancelled (P28). */
export function isSessionChangeable(session: DoctorSessionCalendarItem): boolean {
  return session.status === 'OPEN' || session.status === 'CLOSED';
}
