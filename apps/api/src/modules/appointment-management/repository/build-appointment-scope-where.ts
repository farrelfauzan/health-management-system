import { AppointmentScopeActor } from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';

/**
 * The single source of appointment ownership truth (SJ-2). Ownership is
 * participant-side: an `OWN`-scoped actor reaches an appointment when they own
 * the patient on it or the doctor on it — the two sides a booking connects.
 * Every scoped repository query merges this fragment into its `where`, so a
 * row outside the actor's reach never leaves PostgreSQL and a direct-by-ID
 * probe for someone else's appointment is indistinguishable from a missing
 * record.
 */
export function buildAppointmentScopeWhere(
  actor: AppointmentScopeActor,
): Prisma.AppointmentWhereInput {
  if (actor.scope === 'ANY') {
    return {};
  }
  return {
    OR: [
      { patient: { ownerUserId: actor.userId } },
      { doctor: { ownerUserId: actor.userId } },
    ],
  };
}
