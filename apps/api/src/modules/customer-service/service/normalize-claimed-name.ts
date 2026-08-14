/**
 * Reduces a name a customer typed to one canonical form for comparison
 * (strategy §5.1).
 *
 * **A phone number identifies a household, not a person.** One number is
 * shared by a family here: a parent books for a child, an adult child books
 * for a parent, and patients who are very young or very old usually have no
 * number of their own. Matching a booking to a patient record on the number
 * alone therefore attaches every booking from that number to whoever it
 * resolved to first — the child's appointment lands on the parent's record,
 * and any clinical note taken at arrival lands there with it.
 *
 * The name is what separates the people behind one number, so it has to be
 * compared rather than merely stored. It arrives typed by hand into a chat,
 * so the comparison is on letters and word breaks only: case, punctuation and
 * repeated spaces all vary between two turns from the same person and none of
 * them mean a different patient.
 *
 * **Deliberately not fuzzy.** A near-miss creates a second draft, which the
 * front desk merges at arrival — a visible, recoverable outcome. Treating two
 * different names as the same patient is neither. Where this function is
 * unsure it must answer "different", and the daily draft cap, not name
 * collapsing, is what keeps one person from accumulating records.
 */
export function normalizeClaimedName(rawName: string): string {
  return rawName
    .toLocaleLowerCase('id-ID')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
