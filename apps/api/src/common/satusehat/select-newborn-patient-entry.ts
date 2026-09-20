import { SatusehatNewbornSearchCriteria } from '@hms/shared-types';

import { SatusehatSearchBundle } from './satusehat.types';

/**
 * Picks the baby out of a `nik-ibu` search (P24-T11, FR-NB-03).
 *
 * A mother's NIK identifies **every** one of her children, so the search
 * returns siblings as readily as the baby in front of the bidan. Two facts
 * tell them apart: the date of birth and the birth order. Both must agree —
 * matching on the date alone would link a twin to her sister, and matching on
 * the birth order alone would link this year's baby to the one born in 2019.
 *
 * Returns null when nothing matches, which is the caller's signal to create
 * her. Never guesses: an entry missing either field is not a match, because a
 * record we cannot tell apart from a sibling is not one we may claim.
 */
export function selectNewbornPatientEntry(
  bundle: SatusehatSearchBundle,
  criteria: SatusehatNewbornSearchCriteria,
): string | null {
  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource;
    if (resource === undefined) {
      continue;
    }
    const ihsNumber = resource.id;
    if (typeof ihsNumber !== 'string' || ihsNumber === '') {
      continue;
    }
    if (resource.birthDate !== criteria.birthDate) {
      continue;
    }
    if (resource.multipleBirthInteger !== criteria.multipleBirthInteger) {
      continue;
    }
    return ihsNumber;
  }
  return null;
}
