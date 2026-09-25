import type { Specialty } from '@hms/shared-types';

/** The name the seed gives the midwife's poli. */
const MIDWIFERY_SPECIALTY_NAME = 'kebidanan';

/**
 * The Kebidanan poli, if the clinic has an active one — the default a new
 * midwife profile is offered. Matched by name because the clinic may have
 * created it itself; a clinic that renamed it simply gets no default.
 */
export function findMidwiferySpecialtyId(specialties: readonly Specialty[]): string | undefined {
  return specialties.find(
    (specialty) =>
      specialty.isActive && specialty.name.trim().toLowerCase() === MIDWIFERY_SPECIALTY_NAME,
  )?.id;
}
