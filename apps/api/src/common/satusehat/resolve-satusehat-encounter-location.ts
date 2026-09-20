import { SatusehatEncounterLocation, SatusehatEncounterLocationSources } from '@hms/shared-types';

import { resolveSatusehatRootLocationId } from './resolve-satusehat-root-location-id';

/**
 * The Location an Encounter reports under (P24-T07, FR-LOC-09).
 *
 * The poli's own registered Location wins, so SATUSEHAT can tell Poli KIA from
 * Poli Umum. A visit whose poli is unregistered — or which names no poli at
 * all, as a walk-in registered without one does — falls back to the root site
 * chain ({@link resolveSatusehatRootLocationId}) and says so, because the two
 * gaps call for different fixes and an operator should only be sent to the
 * Location panel for the one it can close.
 *
 * An inpatient stay is different: its `location[]` is the bed history, so the
 * poli never decides it and the warning is about a bed nobody registered.
 */
export function resolveSatusehatEncounterLocation(
  sources: SatusehatEncounterLocationSources,
): SatusehatEncounterLocation {
  if (sources.bedLocationIds.length > 0) {
    // An inpatient stay names its beds, not its poli (P24-T08, FR-IP-01), so
    // the resolved id is only what an unregistered bed falls back to — and a
    // bed belongs to a ward, so it falls back to the site rather than to the
    // poli the patient was first seen in.
    return {
      locationId: resolveSatusehatRootLocationId(sources),
      fallbackReason: sources.bedLocationIds.some((locationId) => locationId === null)
        ? 'BED_NOT_REGISTERED'
        : null,
    };
  }
  if (sources.specialtyLocationId !== null) {
    return { locationId: sources.specialtyLocationId, fallbackReason: null };
  }
  return {
    locationId: resolveSatusehatRootLocationId(sources),
    fallbackReason: sources.specialtyName === null ? 'NO_POLI' : 'POLI_NOT_REGISTERED',
  };
}
