import { SatusehatPractitionerSummary } from '@hms/shared-types';

const NIK_IDENTIFIER_SYSTEM = 'https://fhir.kemkes.go.id/id/nik';

function readRecord(source: unknown): Record<string, unknown> | null {
  return typeof source === 'object' && source !== null ? (source as Record<string, unknown>) : null;
}

/**
 * `name[0].text` is the populated form on the platform (P21-T01). Given and
 * family parts are joined as a fallback so a differently shaped record still
 * shows the operator something to compare, rather than nothing.
 */
function readName(resource: Record<string, unknown>): string | null {
  const names = Array.isArray(resource.name) ? resource.name : [];
  const first = readRecord(names[0]);
  if (first === null) {
    return null;
  }
  if (typeof first.text === 'string' && first.text.trim().length > 0) {
    return first.text.trim();
  }
  const given = Array.isArray(first.given)
    ? first.given.filter((part) => typeof part === 'string')
    : [];
  const parts = [...given, typeof first.family === 'string' ? first.family : null].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

function readMaskedNik(resource: Record<string, unknown>): string | null {
  const identifiers = Array.isArray(resource.identifier) ? resource.identifier : [];
  const nik = identifiers
    .map((identifier) => readRecord(identifier))
    .find((identifier) => identifier?.system === NIK_IDENTIFIER_SYSTEM);
  return typeof nik?.value === 'string' ? nik.value : null;
}

/**
 * Projects a `Practitioner` read to the two fields an operator can confirm a
 * manual link by (P21-T08). The FHIR shape stays in the adapter. The masked NIK
 * is kept only so the caller can compare its visible digits, and is never
 * returned to a client.
 */
export function readPractitionerSummary(
  resource: unknown,
  ihsNumber: string,
): SatusehatPractitionerSummary {
  const record = readRecord(resource) ?? {};
  return {
    ihsNumber,
    name: readName(record),
    maskedNik: readMaskedNik(record),
  };
}
