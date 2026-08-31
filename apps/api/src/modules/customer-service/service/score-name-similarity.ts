/**
 * How alike two Indonesian personal names are, as a number in `0 … 1`.
 *
 * Token-set overlap rather than an edit distance, because of what actually
 * varies between the name a chatbot was told and the name on a registry
 * record. People drop a middle name, reorder a two-part name, add or omit
 * `bin`/`binti`, and are entered once with a title and once without. Every one
 * of those is a whole-token difference, which Levenshtein charges by the
 * character — "Siti Rahmawati" against "Rahmawati" scores badly on edit
 * distance and is very often the same person.
 *
 * A token counts as shared when it matches exactly or when one is a prefix of
 * the other and at least four characters long, which is what catches the
 * abbreviated first name ("Muh" for "Muhammad") without letting "Sri" match
 * "Srikandi".
 *
 * **This score never decides anything.** It orders candidates for a human who
 * is holding the person's ID document; the front desk links or converts, and
 * nothing in this file is allowed to do either.
 */
export function scoreNameSimilarity(left: string, right: string): number {
  const leftTokens = tokenizeName(left);
  const rightTokens = tokenizeName(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const matched = leftTokens.filter((token) =>
    rightTokens.some((other) => areTokensEquivalent(token, other)),
  ).length;

  // Divided by the *shorter* side, so "Siti Rahmawati" against "Siti Nur
  // Rahmawati Putri" scores 1 rather than 0.5. A registry record carrying more
  // name than the chat was given is the ordinary case, not evidence of a
  // different person.
  return matched / Math.min(leftTokens.length, rightTokens.length);
}

/** Shortest prefix that may stand in for a longer token. */
const MIN_PREFIX_TOKEN_LENGTH = 4;

/**
 * Honorifics and lineage particles carry no identity, and leaving them in
 * would let two unrelated "Muhammad bin ..." records score as a partial match
 * on the particle alone.
 */
const NON_IDENTIFYING_TOKENS = new Set([
  'bin',
  'binti',
  'dr',
  'drg',
  'h',
  'hj',
  'ibu',
  'ir',
  'nn',
  'ny',
  'tn',
]);

function tokenizeName(value: string): string[] {
  return value
    .toLowerCase()
    // Punctuation, not whitespace: "M.Yusuf" and "M Yusuf" are one name typed
    // two ways, and splitting only on spaces would make them share nothing.
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 0 && !NON_IDENTIFYING_TOKENS.has(token));
}

function areTokensEquivalent(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return shorter.length >= MIN_PREFIX_TOKEN_LENGTH && longer.startsWith(shorter);
}
