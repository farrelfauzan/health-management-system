/**
 * A customer explicitly asking for a person (§4.2, §6).
 *
 * Deliberately narrow, and matched on the customer's own words rather than
 * inferred by the model. Handoff is one of the few decisions where the wrong
 * answer in either direction is cheap to describe and expensive to live with:
 * missing a real request leaves someone arguing with a bot, and firing on
 * every mention of the word "petugas" ("...petugas bilang saya harus daftar
 * dulu") drains the handoff queue of signal until staff stop reading it.
 *
 * So these match *requests*, not mentions — a verb of wanting or asking has
 * to be present alongside the human, or the phrase has to be an unambiguous
 * complaint about the bot itself. Anything subtler is left to the model,
 * which will call the handoff tool at `PCS-T07`.
 */
export const CS_HANDOFF_REQUEST_PATTERNS: readonly RegExp[] = [
  // "mau bicara dengan petugas", "bisa sambungkan ke admin", "minta cs"
  /\b(bicara|ngobrol|hubung\w*|sambung\w*|minta|mau|ingin|butuh|panggil\w*)\b[^.?!]{0,30}\b(petugas|admin|operator|manusia|orang(nya)?|cs|customer\s*service|resepsionis|suster)\b/i,
  // The same request the other way round: "petugasnya mana", "ada orang?"
  /\b(petugas|admin|operator|manusia|cs|customer\s*service)\b[^.?!]{0,20}\b(mana|dong|ya|nya|ada)\b\s*\??/i,
  // Explicit rejection of the bot.
  /\b(jangan|bukan|stop|berhenti)\b[^.?!]{0,20}\b(bot|robot|otomatis|mesin)\b/i,
  /\b(saya\s+)?(mau|ingin)\s+(bicara|berbicara)\s+(dengan|sama)\s+(orang|manusia)\b/i,
  // English, for the minority who write it.
  /\b(talk|speak|chat)\s+(to|with)\s+(a\s+)?(human|person|agent|staff|someone|real\s+person)\b/i,
  /\b(customer\s*service|human\s+agent|real\s+person)\b/i,
  /\b(stop|no)\s+(the\s+)?(bot|robot)\b/i,
];
