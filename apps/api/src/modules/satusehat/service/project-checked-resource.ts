import { SatusehatResourceCheckOutcomeValue } from '@hms/shared-types';

/**
 * The only fields of a SATUSEHAT resource an administrator may see (P21-T03).
 *
 * An **allowlist**, not a denylist, and that is the whole design. P21-T01 read
 * real resources back off the live platform and found that every one of them
 * carries the patient's name in `subject.display`, with practitioner names in
 * `participant`, `performer`, `requester`, `assessor` and `author`. A denylist
 * of "clinical" keys — `code`, `valueQuantity`, `note`, `section` — would have
 * passed the patient's name straight to the front desk while passing its own
 * tests.
 *
 * So this projection names the four things it keeps and drops everything else,
 * including anything a future FHIR profile adds. The monitor answers "did the
 * visit's Conditions arrive", never "what were they".
 */
export type SatusehatCheckedResourceFields = {
  outcome: SatusehatResourceCheckOutcomeValue;
  versionId: string | null;
  lastUpdated: string | null;
  status: string | null;
};

/** Reads one string field off an unknown platform payload, or null. */
function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Reduces a resource SATUSEHAT returned to the fields the monitor may render.
 *
 * `status` is absent on `Condition`, which carries `clinicalStatus` instead
 * (P21-T01). That is reported as null rather than reaching for the
 * `clinicalStatus` coding, because the coding's `code` is a clinical value
 * (`active`, `resolved`) and this projection may not carry one — the doctor's
 * view (P21-T04) is where that belongs.
 */
export function projectCheckedResource(resource: unknown): SatusehatCheckedResourceFields {
  if (typeof resource !== 'object' || resource === null) {
    return { outcome: 'FOUND', versionId: null, lastUpdated: null, status: null };
  }
  const source = resource as Record<string, unknown>;
  const meta = source['meta'];
  const metaSource =
    typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>) : {};
  return {
    outcome: 'FOUND',
    versionId: readString(metaSource, 'versionId'),
    lastUpdated: readString(metaSource, 'lastUpdated'),
    status: readString(source, 'status'),
  };
}
