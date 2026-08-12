import { RegistrationScopeActor } from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';

/**
 * The single source of registration ownership truth (SJ-2). Ownership is
 * patient-side only: an `OWN`-scoped actor reaches a registration when they
 * own the patient it registers — the queue board and staff views are separate
 * `ANY`-gated routes, so no doctor-side reach exists here. Merged into the
 * SQL `where` of every scoped query, so a row outside the actor's reach never
 * leaves PostgreSQL.
 */
export function buildRegistrationScopeWhere(
  actor: RegistrationScopeActor,
): Prisma.RegistrationWhereInput {
  if (actor.scope === 'ANY') {
    return {};
  }
  return { patient: { ownerUserId: actor.userId } };
}
