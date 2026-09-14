import { SatusehatRootLocationSources } from '@hms/shared-types';

/**
 * The root site Location an encounter falls back to (P24-T05, FR-LOC-02).
 *
 * A root registered through the Location panel wins. Until one is, the
 * deployment's `SATUSEHAT_LOCATION_ID` is used, so a clinic that only ever set
 * the env value keeps submitting exactly as before this column existed. `null`
 * when neither is set: the mapper then refuses, as it does today.
 */
export function resolveSatusehatRootLocationId(
  sources: SatusehatRootLocationSources,
): string | null {
  return sources.registeredRootLocationId ?? sources.configuredLocationId ?? null;
}
