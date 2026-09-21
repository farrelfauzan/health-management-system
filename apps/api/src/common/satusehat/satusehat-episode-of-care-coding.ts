/**
 * How an EpisodeOfCare is coded and identified (P25-T08).
 *
 * Its own module so the client and the mapper read one copy, the way
 * `build-satusehat-location-resource.ts` holds the Location identifier system:
 * the mapper builds the resource, the client sends it, and a second copy would
 * let the create and the adopting search disagree about which system to name.
 *
 * Both values here were wrong in the published ANC playbook and are taken from
 * the live gateway instead — see `docs/ops/satusehat-anc-spike.md`.
 */
export const SATUSEHAT_EPISODE_OF_CARE_TYPE_SYSTEM =
  'http://terminology.kemkes.go.id/CodeSystem/episodeofcare-type';

export const SATUSEHAT_ANTENATAL_EPISODE_TYPE_CODE = 'ANC';

export const SATUSEHAT_ANTENATAL_EPISODE_TYPE_DISPLAY = 'Antenatal Care';

const EPISODE_OF_CARE_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/episode-of-care';

/**
 * The org-scoped identifier system for episodes — and for the K-code
 * identifier an antenatal Encounter carries, which the platform reads under
 * the same system.
 */
export function buildSatusehatEpisodeOfCareIdentifierSystem(organizationId: string): string {
  return `${EPISODE_OF_CARE_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`;
}
