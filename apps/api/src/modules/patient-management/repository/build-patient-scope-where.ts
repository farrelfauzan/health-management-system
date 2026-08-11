import { PatientOwnershipMode, PatientScopeActor } from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';

/**
 * The single source of ownership truth for patient rows (SJ-2). Every scoped
 * repository query merges this fragment into its `where`, so an `OWN`-scoped
 * actor's reach is decided by the database — a row outside it never leaves
 * PostgreSQL, and a direct-by-ID probe for someone else's patient is
 * indistinguishable from a missing record.
 *
 * `CARE` extends ownership to a doctor with an active assignment; `SELF` is
 * strictly the owning user — see {@link PatientOwnershipMode} for which
 * actions use which.
 */
export function buildPatientScopeWhere(input: {
  actor: PatientScopeActor;
  ownership: PatientOwnershipMode;
}): Prisma.PatientProfileWhereInput {
  const { actor, ownership } = input;
  if (actor.scope === 'ANY') {
    return {};
  }
  if (ownership === 'SELF') {
    return { ownerUserId: actor.userId };
  }
  return {
    OR: [
      { ownerUserId: actor.userId },
      {
        doctors: {
          some: {
            unassignedAt: null,
            doctor: {
              ownerUserId: actor.userId,
              deletedAt: null,
              isActive: true,
            },
          },
        },
      },
    ],
  };
}
