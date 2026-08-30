/**
 * Which visible row a typed character should jump to (SJ-90).
 *
 * Search starts *after* the focused row and wraps, so pressing the same letter
 * repeatedly cycles through every unit starting with it rather than sticking on
 * the first match. That cycling is the whole reason typeahead is worth having
 * on a chart where a dozen units begin with "Poli".
 *
 * Returns the index of the match, or -1 when nothing starts with the character.
 */
export function findTypeaheadMatch(
  names: readonly string[],
  fromIndex: number,
  character: string,
): number {
  const needle = character.toLowerCase();
  for (let step = 1; step <= names.length; step += 1) {
    const candidate = (fromIndex + step) % names.length;
    if ((names[candidate] ?? '').toLowerCase().startsWith(needle)) {
      return candidate;
    }
  }
  return -1;
}
