/**
 * Indonesian function words dropped from a retrieval *query* — never from the
 * index.
 *
 * This list exists because of a gap that is easy to assume away: Postgres
 * ships an `indonesian` text-search configuration, but it is a **stemmer with
 * no stopword list**. `to_tsvector('indonesian', 'yang')` returns `'yang'`,
 * where `to_tsvector('english', 'the')` returns nothing. So the trick that
 * removes English filler for free removes no Indonesian filler at all — in a
 * corpus and a clinic that are Indonesian first.
 *
 * Why it matters is a ranking failure rather than a crash. The lexical half
 * ORs the question's lexemes, because an AND query cannot answer a
 * conversational message. Left unfiltered, a passage that merely repeats
 * *kami punya … kami punya* scores above one that names the drug the question
 * asked about: `ts_rank` weighs term frequency and has no notion of a term
 * being rare, and at corpus scale the drug passage stops being a candidate at
 * all rather than merely ranking below.
 *
 * **Only closed-class words are listed.** Pronouns, prepositions,
 * conjunctions, particles, question words and copulas — nothing that could
 * name a symptom, a service, a drug, or a document. A word that carries any
 * clinical or operational meaning belongs in the query even if it is common,
 * because the cost of dropping a real term is a question that silently
 * retrieves nothing.
 *
 * The index keeps every word (`simple`, no stemming, no stopwords), so this
 * is reversible: widening or narrowing the list changes future queries and
 * requires no re-ingest.
 */
export const INDONESIAN_QUERY_STOPWORDS: readonly string[] = [
  // Pronouns and possessives
  'saya',
  'aku',
  'kami',
  'kita',
  'anda',
  'kamu',
  'dia',
  'ia',
  'mereka',
  'beliau',
  'nya',
  'ku',
  'mu',
  // Prepositions and directional particles
  'di',
  'ke',
  'dari',
  'pada',
  'kepada',
  'dengan',
  'untuk',
  'oleh',
  'dalam',
  'atas',
  'antara',
  'tentang',
  'terhadap',
  // Conjunctions
  'dan',
  'atau',
  'tetapi',
  'tapi',
  'namun',
  'serta',
  'karena',
  'sebab',
  'jika',
  'kalau',
  'bila',
  'agar',
  'supaya',
  'sehingga',
  'meskipun',
  'walaupun',
  'sedangkan',
  'maupun',
  // Determiners, quantifiers and relativisers
  'yang',
  'ini',
  'itu',
  'para',
  'sebuah',
  'suatu',
  'setiap',
  'semua',
  'seluruh',
  'beberapa',
  // Question words
  'apa',
  'apakah',
  'siapa',
  'kapan',
  'mana',
  'dimana',
  'kemana',
  'bagaimana',
  'mengapa',
  'kenapa',
  'berapa',
  // Copulas, auxiliaries and common verbs of no content
  'adalah',
  'ialah',
  'merupakan',
  'ada',
  'akan',
  'sudah',
  'telah',
  'sedang',
  'masih',
  'belum',
  'bisa',
  'dapat',
  'boleh',
  'harus',
  'perlu',
  'ingin',
  'mau',
  'punya',
  'memiliki',
  'menjadi',
  // Negation, affirmation and discourse particles
  'tidak',
  'bukan',
  'jangan',
  'ya',
  'iya',
  'juga',
  'saja',
  'pun',
  'lah',
  'kah',
  'sih',
  'dong',
  'mohon',
  'tolong',
  'silakan',
  'terima',
  'kasih',
  'halo',
  'hai',
  'selamat',
];
