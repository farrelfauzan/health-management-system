/**
 * The org-scoped identifier systems the bundle stamps, per resource type. Only
 * these carry a local record id back; `Condition` and `Observation` are
 * deliberately absent because the platform stamps no identifier on them
 * (P21-T01), so their `localRecordId` stays null on a backfilled row.
 *
 * `MedicationRequest` returns **two** identifiers — `prescription` and
 * `prescription-item` — so matching selects by system rather than taking
 * `identifier[0]`.
 */
const LOCAL_ID_SYSTEM_SUFFIX: Readonly<Record<string, string>> = {
  Procedure: 'procedure',
  ClinicalImpression: 'clinicalimpression',
  Composition: 'composition',
  MedicationRequest: 'prescription-item',
};

const IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id';

type PlatformIdentifier = {
  system?: unknown;
  value?: unknown;
};

/**
 * Normalises the identifier field, which is **not one shape**: `Composition`
 * returns a bare object where the others return arrays (P21-T01). Code that
 * called `.map` on it threw while the spike was probing, which is exactly the
 * bug this exists to prevent.
 */
function toIdentifierList(identifier: unknown): PlatformIdentifier[] {
  if (Array.isArray(identifier)) {
    return identifier.filter(
      (entry): entry is PlatformIdentifier => typeof entry === 'object' && entry !== null,
    );
  }
  if (typeof identifier === 'object' && identifier !== null) {
    return [identifier as PlatformIdentifier];
  }
  return [];
}

/**
 * The local record id the platform echoed back for one resource, or null.
 *
 * Matched on the org-scoped system so a resource carrying several identifiers
 * yields the right one, and so an identifier from another organisation is never
 * mistaken for ours.
 */
export function resolveBackfilledLocalRecordId(input: {
  resourceType: string;
  identifier: unknown;
  organizationId: string;
}): string | null {
  const suffix = LOCAL_ID_SYSTEM_SUFFIX[input.resourceType];
  if (suffix === undefined) {
    return null;
  }
  const expectedSystem = `${IDENTIFIER_SYSTEM_PREFIX}/${suffix}/${input.organizationId}`;
  const match = toIdentifierList(input.identifier).find(
    (entry) => entry.system === expectedSystem && typeof entry.value === 'string',
  );
  return typeof match?.value === 'string' && match.value !== '' ? match.value : null;
}
