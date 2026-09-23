import type { AppointmentSessionResponse, DoctorSessionCalendarItem } from '@hms/shared-types';

import { appointmentSessionChangeControllerMaterializeSessionV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { parseApiSuccess } from '#lib/api/response';

/**
 * The session row behind a calendar entry (P28-T02). An occurrence nobody has
 * booked is only a projection of the weekly schedule and has no id yet, so it
 * is materialised first — the same row the first booking would have created.
 */
export async function resolveMaterializedSessionId(
  session: DoctorSessionCalendarItem,
  fallbackError: string,
): Promise<string> {
  if (session.id !== null) {
    return session.id;
  }
  const response = await appointmentSessionChangeControllerMaterializeSessionV1({
    scheduleId: session.scheduleId,
    sessionDate: session.sessionDate,
  });
  return parseApiSuccess<AppointmentSessionResponse>(response, fallbackError).data.id;
}
