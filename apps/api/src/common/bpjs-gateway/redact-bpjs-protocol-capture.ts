import { createHash } from 'node:crypto';

const REDACTED = '[redacted]';
const NIK_LENGTH = 16;
const CARD_NUMBER_LENGTH = 13;
const SYNTHETIC_NIK_PREFIX = '3201';
const SYNTHETIC_CARD_PREFIX = '000';
const MAX_CAPTURED_BODY_LENGTH = 20_000;

/**
 * Header names whose values are credentials or derived from them. Matched
 * case-insensitively because BPJS's own documentation is inconsistent about
 * casing (`X-Timestamp` vs `x-timestamp`, `user_key` vs `User-Key`), and a
 * case-sensitive list would leak the very thing this exists to protect.
 */
const CREDENTIAL_HEADER_NAMES: readonly string[] = [
  'x-cons-id',
  'x-signature',
  'x-authorization',
  'user_key',
  'user-key',
  'authorization',
  'x-token',
];

/**
 * Field names carrying a member identifier or a person's name. Replaced with
 * structurally valid synthetic values rather than removed, because a fixture
 * with the field missing tests a different payload than the one BPJS actually
 * saw — and shape is most of what a fixture is for.
 */
const MEMBER_IDENTITY_FIELDS: Readonly<Record<string, 'nik' | 'card' | 'name' | 'phone'>> = {
  nik: 'nik',
  noktp: 'nik',
  nomorkartu: 'card',
  nokartu: 'card',
  nama: 'name',
  namapeserta: 'name',
  nohp: 'phone',
  notelp: 'phone',
};

/**
 * Derives a stable synthetic identifier from the real one. Deterministic on
 * purpose: the same member redacts to the same synthetic value across every
 * captured call, so a reviewer can still follow one participant through a
 * booking, a call and a cancellation — which is most of what makes a captured
 * sequence readable — without the file ever naming them.
 *
 * One-way, and not reversible by anyone holding the fixture: the hash is
 * truncated to the digits the format needs, so the original cannot be
 * recovered from it.
 */
function toSyntheticDigits(value: string, length: number, prefix: string): string {
  const digest = createHash('sha256').update(value).digest('hex');
  const digits = digest.replace(/\D/g, '').padEnd(length, '0');
  return `${prefix}${digits}`.slice(0, length);
}

function redactValue(value: string, kind: 'nik' | 'card' | 'name' | 'phone'): string {
  if (kind === 'nik') {
    return toSyntheticDigits(value, NIK_LENGTH, SYNTHETIC_NIK_PREFIX);
  }
  if (kind === 'card') {
    return toSyntheticDigits(value, CARD_NUMBER_LENGTH, SYNTHETIC_CARD_PREFIX);
  }
  if (kind === 'phone') {
    return '08120000000';
  }
  return `Peserta ${toSyntheticDigits(value, 4, '')}`;
}

/**
 * Redacts the headers of a captured call. Everything not on the credential
 * list is kept verbatim — `X-Timestamp` in particular *must* survive, because
 * the response AES key derives from it (ADR D-022) and a fixture without it
 * cannot be decoded again.
 */
export function redactCapturedHeaders(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    redacted[name] = CREDENTIAL_HEADER_NAMES.includes(name.toLowerCase()) ? REDACTED : value;
  }
  return redacted;
}

/**
 * Walks a decoded payload and replaces member identifiers with synthetic ones.
 *
 * Applied to the *decoded* body only. The raw encrypted body is captured
 * as-is and is the actual evidence of the codec; it is unreadable without the
 * facility's secret key, which is exactly why it is safe to keep and why the
 * decoded copy has to be scrubbed.
 */
export function redactCapturedPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map((entry) => redactCapturedPayload(entry));
  }
  if (payload === null || typeof payload !== 'object') {
    return payload;
  }
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const kind = MEMBER_IDENTITY_FIELDS[key.toLowerCase()];
    if (kind !== undefined && typeof value === 'string' && value !== '') {
      redacted[key] = redactValue(value, kind);
      continue;
    }
    redacted[key] = redactCapturedPayload(value);
  }
  return redacted;
}

/**
 * Truncates a raw body to a bounded length. A capture directory filling a
 * disk during UAT would take the facility's endpoint down at the worst
 * possible moment, and no real BPJS envelope is anywhere near this size.
 */
export function truncateCapturedBody(rawBody: string): string {
  return rawBody.length <= MAX_CAPTURED_BODY_LENGTH
    ? rawBody
    : `${rawBody.slice(0, MAX_CAPTURED_BODY_LENGTH)}…[truncated]`;
}
