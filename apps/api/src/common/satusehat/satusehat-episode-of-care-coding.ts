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

/**
 * The PNC (nifas) episode (P25-T12). The playbook names the type system with
 * `https://`; the sandbox refuses that as an invalid coding system and
 * accepts the `http://` one above — see `docs/ops/satusehat-pnc-spike.md`.
 */
export const SATUSEHAT_POSTNATAL_EPISODE_TYPE_CODE = 'PNC';

export const SATUSEHAT_POSTNATAL_EPISODE_TYPE_DISPLAY = 'Postnatal Care';

/**
 * Where a nifas visit's KF1–KF4 goes on the Encounter: an identifier under
 * this system, beside the encounter's own. A terminology system, unlike the
 * ANC K code's org-scoped one — the sandbox validates the value against it
 * and refuses `KF9` (Rule 10117).
 */
export const SATUSEHAT_PUERPERIUM_VISIT_SYSTEM =
  'http://terminology.kemkes.go.id/CodeSystem/episodeofcare/puerperium';

/**
 * Where a neonatal visit's KN1–KN3 goes. Not in the playbook; found by probing
 * the sandbox, which accepts KN1–KN3 here and refuses `KN9`, and refuses
 * `…/neonatal` and `…/newborn` outright.
 */
export const SATUSEHAT_NEONATAL_VISIT_SYSTEM =
  'http://terminology.kemkes.go.id/CodeSystem/episodeofcare/neonate';
