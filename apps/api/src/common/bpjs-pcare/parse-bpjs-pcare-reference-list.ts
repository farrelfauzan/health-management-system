import { BpjsPcareError } from './bpjs-pcare.error';
import {
  BpjsPcareReferenceEntry,
  BpjsPcareReferenceListPage,
} from './bpjs-pcare-reference.types';

type ParseBpjsPcareReferenceListOptions = {
  readonly response: unknown;
  readonly codeField: string;
  readonly displayField: string;
  readonly groupCode?: string;
};

/**
 * Normalises a decoded PCare reference payload into code/display entries.
 * PCare list envelopes are `{ count, list }` (count arrives as string or
 * number, or not at all) and a "no data" outcome is a null response, which
 * parses to an empty page. A present entry missing its code or display field
 * is protocol drift and fails loudly as RESPONSE_MALFORMED — never silently
 * dropped, so a BPJS-side rename cannot quietly empty a synced catalog.
 */
export function parseBpjsPcareReferenceList(
  options: ParseBpjsPcareReferenceListOptions,
): BpjsPcareReferenceListPage {
  const { response, codeField, displayField, groupCode } = options;
  if (response === null || response === undefined) {
    return { entries: [], totalCount: 0 };
  }
  const rawList = extractRawList(response);
  const entries = rawList.map(
    (rawEntry: unknown): BpjsPcareReferenceEntry =>
      normalizeEntry(rawEntry, codeField, displayField, groupCode),
  );
  return { entries, totalCount: extractTotalCount(response, entries.length) };
}

function extractRawList(response: unknown): unknown[] {
  if (Array.isArray(response)) {
    return response;
  }
  if (typeof response === 'object' && Array.isArray((response as { list?: unknown }).list)) {
    return (response as { list: unknown[] }).list;
  }
  throw new BpjsPcareError(
    'BPJS_PCARE_RESPONSE_MALFORMED',
    'BPJS PCare reference payload carries no list of entries',
  );
}

function normalizeEntry(
  rawEntry: unknown,
  codeField: string,
  displayField: string,
  groupCode?: string,
): BpjsPcareReferenceEntry {
  const code = readEntryField(rawEntry, codeField);
  const display = readEntryField(rawEntry, displayField);
  if (code === null || display === null) {
    throw new BpjsPcareError(
      'BPJS_PCARE_RESPONSE_MALFORMED',
      `BPJS PCare reference entry is missing ${codeField}/${displayField}`,
    );
  }
  return groupCode === undefined ? { code, display } : { code, display, groupCode };
}

function readEntryField(rawEntry: unknown, fieldName: string): string | null {
  if (typeof rawEntry !== 'object' || rawEntry === null) {
    return null;
  }
  const value = (rawEntry as Record<string, unknown>)[fieldName];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function extractTotalCount(response: unknown, fallbackCount: number): number | null {
  if (typeof response !== 'object' || response === null || Array.isArray(response)) {
    return fallbackCount;
  }
  const rawCount = (response as { count?: unknown }).count;
  if (typeof rawCount === 'number' && Number.isFinite(rawCount)) {
    return rawCount;
  }
  if (typeof rawCount === 'string' && /^[0-9]+$/.test(rawCount.trim())) {
    return Number.parseInt(rawCount.trim(), 10);
  }
  return null;
}
