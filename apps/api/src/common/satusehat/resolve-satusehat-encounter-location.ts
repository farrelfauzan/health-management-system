import { SatusehatEncounterLocation, SatusehatEncounterLocationSources } from '@hms/shared-types';

import { resolveSatusehatRootLocationId } from './resolve-satusehat-root-location-id';

/**
 * The Location one outpatient Encounter reports under (P24-T07, FR-LOC-09).
 *
 * The poli's own registered Location wins, so SATUSEHAT can tell Poli KIA from
 * Poli Umum. A visit whose poli is unregistered — or which names no poli at
 * all, as a walk-in registered without one does — falls back to the root site
 * chain ({@link resolveSatusehatRootLocationId}) and says so, because the two
 * gaps call for different fixes and an operator should only be sent to the
 * Location panel for the one it can close.
 */
export function resolveSatusehatEncounterLocation(
  sources: SatusehatEncounterLocationSources,
): SatusehatEncounterLocation {
  if (sources.specialtyLocationId !== null) {
    return { locationId: sources.specialtyLocationId, fallbackReason: null };
  }
  return {
    locationId: resolveSatusehatRootLocationId(sources),
    fallbackReason: sources.specialtyName === null ? 'NO_POLI' : 'POLI_NOT_REGISTERED',
  };
}
