/**
 * Emergency phrasings this channel sees that the in-app patterns miss.
 *
 * `AI_CHAT_SAFETY_PATTERNS.emergency` is tuned for the register people use in
 * a web form — `nyeri dada`, `sesak napas` — with the two words adjacent and
 * in that order. A customer on WhatsApp writes "dada saya sakit banget" and
 * "sesak nih", and every one of those slips past a pattern that requires
 * adjacency. The gap was found by a failing test, not by reading, which is
 * exactly why this file exists rather than a note asking someone to be
 * careful.
 *
 * These are additive: the shared list still runs, and this one catches the
 * colloquial half. Deliberately **not** merged into the shared list, because
 * the in-app channel does not need looser matching and widening a guard for
 * one caller is how the other caller starts producing false positives nobody
 * asked for.
 *
 * **The asymmetry is the design.** A false positive here shows someone the
 * ambulance number when they did not need it; a false negative leaves someone
 * describing chest pain waiting on a language model. These patterns are
 * deliberately tuned toward the first, and `sesak` on its own is the clearest
 * case — it can mean "crowded", but in a message to a clinic it almost never
 * does, and the cost of being wrong is one unnecessary safety message.
 */
export const CS_EMERGENCY_PATTERNS: readonly RegExp[] = [
  // "dada saya sakit", "dada terasa nyeri sekali" — the reversed order the
  // shared list cannot express.
  /\bdada\b[^.?!]{0,20}\b(sakit|nyeri|sesak|berat|ditekan|ditindih)\b/i,
  /\b(sakit|nyeri)\b[^.?!]{0,20}\bdada\b/i,
  // `sesak` unqualified. See the asymmetry note above.
  /\bsesak\b/i,
  // Colloquial and regional negations the shared list's "tidak bisa" misses.
  /\b(nggak|ngga|gak|ga|ndak|kagak|tak)\s+(bisa|kuat|sanggup)\s+(napas|nafas|bernapas|bernafas|nafasnya)\b/i,
  /\bsusah\s+(napas|nafas)\b/i,
  // Bleeding that will not stop, phrased as people phrase it.
  /\bdarah\b[^.?!]{0,20}\b(terus|banyak|deras|nggak\s+berhenti|tidak\s+berhenti)\b/i,
  // Unresponsive, colloquially.
  /\b(nggak|ngga|gak|ga|tidak)\s+sadar\b/i,
  /\b(gawat|darurat)\b[^.?!]{0,20}\b(banget|sekali|nih|sekarang)\b/i,
];
