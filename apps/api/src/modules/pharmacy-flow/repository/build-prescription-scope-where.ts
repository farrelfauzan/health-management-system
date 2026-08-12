import { PrescriptionScopeActor } from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';

/**
 * The single source of prescription ownership truth (SJ-2). Ownership is
 * participant-side, like appointments: an `OWN`-scoped actor reaches a
 * prescription when they own the patient on it or the prescribing doctor on
 * it. Merged into the SQL `where` of every scoped query, so rows outside the
 * actor's reach never leave PostgreSQL.
 */
export function buildPrescriptionScopeWhere(
  actor: PrescriptionScopeActor,
): Prisma.PrescriptionWhereInput {
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
