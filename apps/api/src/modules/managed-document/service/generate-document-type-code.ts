const MAX_CODE_STEM_LENGTH = 48;
const FALLBACK_CODE_STEM = 'TYPE';
const NUMERIC_LEAD_PREFIX = 'T_';
const FIRST_COLLISION_SUFFIX = 2;

/**
 * Derives a type's stable `code` from its display name (`P16-T39`,
 * §7.5.10): upper snake case, ASCII only, and unique against the codes
 * already taken. Two types may share a name — the clinic's words are the
 * clinic's — so a collision gets a numeric suffix rather than a refusal.
 *
 * Generated once, at create. Renaming never touches it (FR-E5-37).
 */
export function generateDocumentTypeCode(name: string, takenCodes: ReadonlySet<string>): string {
  const stem = buildCodeStem(name);
  if (!takenCodes.has(stem)) {
    return stem;
  }
  let suffix = FIRST_COLLISION_SUFFIX;
  while (takenCodes.has(`${stem}_${suffix}`)) {
    suffix += 1;
  }
  return `${stem}_${suffix}`;
}

function buildCodeStem(name: string): string {
  const ascii = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_CODE_STEM_LENGTH)
    .replace(/_+$/g, '');
  if (ascii === '') {
    return FALLBACK_CODE_STEM;
  }
  return /^[0-9]/.test(ascii) ? `${NUMERIC_LEAD_PREFIX}${ascii}` : ascii;
}
