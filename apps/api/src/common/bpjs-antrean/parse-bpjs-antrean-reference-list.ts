import { BpjsAntreanError } from './bpjs-antrean.error';

export type BpjsAntreanReferenceEntry = {
  readonly code: string;
  readonly display: string;
};

type ParseBpjsAntreanReferenceListOptions = {
  readonly response: unknown;
  readonly codeField: string;
  readonly displayField: string;
};

/**
 * Normalises a decoded HFIS reference payload (`ref/poli`, `ref/dokter`) into
 * code/display entries (P14-T05).
 *
 * A separate parser from the PCare one on purpose. PCare wraps its lists in
 * `{ count, list }` (ADR D-022); the antrean references are documented as a
 * bare array, and quietly accepting either shape would hide the moment the
 * protocols diverge. Both forms are handled anyway — because guessing wrong
 * here means a reconciliation screen that reports every poli as missing — but
 * a payload that is neither fails loudly rather than reporting an empty HFIS.
 *
 * That last part matters more than it looks: an empty list and a
 * *misunderstood* list produce the same screen, and one of them tells the
 * clinic to go and fix mappings that were never broken.
 */
export function parseBpjsAntreanReferenceList(
  options: ParseBpjsAntreanReferenceListOptions,
): BpjsAntreanReferenceEntry[] {
  const { response, codeField, displayField } = options;
  if (response === null || response === undefined) {
    return [];
  }
  return extractRawList(response).map((rawEntry) =>
    normalizeEntry(rawEntry, codeField, displayField),
  );
}

function extractRawList(response: unknown): unknown[] {
  if (Array.isArray(response)) {
    return response;
  }
  if (typeof response === 'object') {
    const list = (response as Record<string, unknown>).list;
    if (Array.isArray(list)) {
      return list;
    }
  }
  throw new BpjsAntreanError(
    'BPJS_ANTREAN_RESPONSE_MALFORMED',
    'HFIS reference response is neither a list nor a { list } envelope',
  );
}

function normalizeEntry(
  rawEntry: unknown,
  codeField: string,
  displayField: string,
): BpjsAntreanReferenceEntry {
  if (rawEntry === null || typeof rawEntry !== 'object') {
    throw new BpjsAntreanError(
      'BPJS_ANTREAN_RESPONSE_MALFORMED',
      'HFIS reference entry is not an object',
    );
  }
  const entry = rawEntry as Record<string, unknown>;
  const code = entry[codeField];
  const display = entry[displayField];
  if (typeof code !== 'string' || typeof display !== 'string') {
    throw new BpjsAntreanError(
      'BPJS_ANTREAN_RESPONSE_MALFORMED',
      `HFIS reference entry is missing ${codeField} or ${displayField}`,
    );
  }
  return { code, display };
}
