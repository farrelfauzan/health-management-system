import { MaternalDueReach } from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';

/**
 * The patients a due-worklist reach covers (P25-T17), as a patient filter:
 * everyone under ANY scope; under OWN the patient herself and the patients
 * actively assigned to the caller's clinician profile — the reach
 * `EncounterAccessService` grants to her episodes.
 */
export function buildPatientReachFilter(reach: MaternalDueReach): Prisma.PatientProfileWhereInput {
  if (reach.hasAny) {
    return { deletedAt: null };
  }
  const own: Prisma.PatientProfileWhereInput[] = [{ ownerUserId: reach.ownerUserId }];
  if (reach.doctorId !== null) {
    own.push({ doctors: { some: { doctorId: reach.doctorId, unassignedAt: null } } });
  }
  return { deletedAt: null, OR: own };
}
