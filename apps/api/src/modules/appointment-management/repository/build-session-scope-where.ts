import { AppointmentScopeActor } from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';

/**
 * The single source of session ownership truth (SJ-2). A practice session
 * belongs to its doctor and nobody else — a patient-side relationship never
 * reaches one, so `OWN` scope resolves strictly through the session doctor's
 * owning user. Doctor-profile-level queries (session calendars) apply the
 * same rule directly on `ownerUserId`.
 */
export function buildSessionScopeWhere(
  actor: AppointmentScopeActor,
): Prisma.AppointmentSessionWhereInput {
  if (actor.scope === 'ANY') {
    return {};
  }
  return { doctor: { ownerUserId: actor.userId } };
}
