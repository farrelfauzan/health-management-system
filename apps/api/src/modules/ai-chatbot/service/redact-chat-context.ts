/**
 * Keys that must never reach a third-party provider (§3.1 rule 5 and §5.3):
 * national and payer identifiers, the medical record number, clinical free
 * text, credentials, and the internal ids that would let a prompt-injected
 * model ask for more. Matched case-insensitively as a substring, so
 * `patientNik`, `bpjs_number`, and `soapNotes` are all caught.
 */
const FORBIDDEN_KEY_FRAGMENTS: readonly string[] = [
  'nik',
  'bpjs',
  'mrn',
  'medicalrecord',
  'note',
  'diagnos',
  'allerg',
  'prescription',
  'token',
  'secret',
  'password',
  'apikey',
  'ciphertext',
  'patientid',
  'doctorid',
  'userid',
  'email',
  'phone',
  'address',
];

function isForbiddenKey(key: string): boolean {
  const normalisedKey = key.toLowerCase().replace(/[^a-z]/g, '');
  return FORBIDDEN_KEY_FRAGMENTS.some((fragment) => normalisedKey.includes(fragment));
}

/**
 * Defence in depth over the context builders. The builders already project
 * down to the handful of fields §5.3 allows; this strips anything forbidden
 * that a future edit might reintroduce, so a mistake upstream degrades the
 * context instead of leaking an identifier to a vendor. Drops empty objects
 * and nullish values too, keeping the payload to what is actually known.
 */
export function redactChatContext(payload: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (isForbiddenKey(key) || value === null || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      continue;
    }
    if (typeof value === 'object') {
      const nested = redactChatContext(value as Record<string, unknown>);
      if (Object.keys(nested).length > 0) {
        redacted[key] = nested;
      }
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}
