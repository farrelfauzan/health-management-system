/**
 * The pattern denylists behind the §3.2/§3.3 guards, kept as data so the
 * policy is reviewable in one place and tunable without touching control
 * flow. Every list is bilingual: an Indonesian clinic's patients type in
 * Bahasa Indonesia, English, or a mix of both, and a guard that only reads
 * English is a guard that does not exist here.
 *
 * These are deliberately **conservative and assertion-shaped**. Matching any
 * mention of a disease would flag "apa itu diabetes?", which is exactly the
 * general health information the patient channel is meant to provide; what is
 * blocked is language that *asserts a conclusion about this person* or
 * *issues an order*.
 */
export const AI_CHAT_SAFETY_PATTERNS = {
  /**
   * Emergency symptoms. These short-circuit the provider entirely: a model
   * round trip is the wrong dependency when someone describes chest pain.
   */
  emergency: [
    /\b(nyeri|sakit)\s+dada\b/i,
    /\bsesak\s+(napas|nafas)\b/i,
    /\b(tidak|sulit|susah)\s+bisa\s+bernapas\b/i,
    /\bpendarahan\s+(hebat|banyak|tidak\s+berhenti)\b/i,
    /\b(pingsan|tidak\s+sadar(kan)?(\s+diri)?|kejang)\b/i,
    /\b(stroke|lumpuh\s+sebelah|bicara\s+pelo)\b/i,
    /\b(bunuh\s+diri|mengakhiri\s+hidup)\b/i,
    /\bchest\s+pain\b/i,
    /\b(can'?t|cannot|difficulty|trouble)\s+breath(e|ing)\b/i,
    /\bshortness\s+of\s+breath\b/i,
    /\b(heavy|severe|uncontrolled)\s+bleeding\b/i,
    /\b(unconscious|passed\s+out|seizure|convulsion)\b/i,
    /\b(suicid(e|al)|kill\s+myself|end\s+my\s+life)\b/i,
  ],
  /** Attempts to talk the model out of its instructions. */
  promptInjection: [
    /\bignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instruction|prompt|rule|message)/i,
    /\b(disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+)?(previous|prior|above|system|safety)\s+(instruction|prompt|rule|polic)/i,
    /\bsystem\s+prompt\b/i,
    /\b(developer|admin|root)\s+mode\b/i,
    /\bjailbreak\b/i,
    /\bDAN\s+mode\b/,
    /\babaikan\s+(semua\s+|seluruh\s+)?(instruksi|aturan|perintah)\s+(sebelum|di\s*atas|sistem)/i,
    /\b(lupakan|hiraukan)\s+(semua\s+)?(instruksi|aturan)\s+(sebelum|sistem)/i,
    /\bmode\s+(pengembang|admin)\b/i,
  ],
  /** Attempts to make the model claim clinical authority it does not have. */
  impersonation: [
    /\b(pretend|act|behave)\s+(to\s+be|as|like)\s+(a|an|my)?\s*(doctor|physician|nurse|pharmacist|clinician)\b/i,
    /\byou\s+are\s+(now\s+)?(a|an|my)\s+(doctor|physician|nurse|pharmacist)\b/i,
    /\b(berpura|pura)-?pura(lah)?\s+(menjadi|jadi)\s+(dokter|perawat|apoteker)\b/i,
    /\b(kamu|anda)\s+(adalah|sekarang)\s+(seorang\s+)?(dokter|perawat|apoteker)\b/i,
    /\bbertindak(lah)?\s+sebagai\s+(seorang\s+)?(dokter|perawat|apoteker)\b/i,
  ],
  /**
   * Output language that asserts a diagnosis *about the reader* — second
   * person plus a conclusion verb. "Gejala ini bisa disebabkan oleh banyak
   * hal" stays; "Anda menderita demam berdarah" does not.
   */
  diagnosisAssertion: [
    /\b(anda|kamu)\s+(menderita|mengidap|terkena|positif)\b/i,
    /\bdiagnosis\s+(anda|kamu)\s+(adalah|ialah)\b/i,
    /\bini\s+(adalah|merupakan)\s+(penyakit|kondisi)\s+(anda|kamu)\b/i,
    /\byou\s+(have|are\s+suffering\s+from|are\s+diagnosed\s+with)\b/i,
    /\byour\s+diagnosis\s+is\b/i,
  ],
  /**
   * Output language that issues a medication order — a dose, a frequency, or
   * an imperative to take something. General drug-class information is
   * allowed and does not match these.
   */
  prescriptionAssertion: [
    /\b(minum|konsumsi|gunakan)\s+\S+\s*\d+\s*(mg|ml|mcg|g|tablet|kapsul|kaplet)\b/i,
    /\b\d+\s*(mg|ml|mcg)\b[^.]{0,40}\b\d+\s*(x|kali)\s*(sehari|per\s*hari)\b/i,
    /\b(saya\s+)?(resep(kan)?|meresepkan)\b/i,
    /\btake\s+\S+\s*\d+\s*(mg|ml|mcg|g|tablets?|capsules?)\b/i,
    /\b\d+\s*(mg|ml|mcg)\b[^.]{0,40}\b(once|twice|three\s+times|\d+\s*times)\s+(a|per)\s+day\b/i,
    /\bI\s+(am\s+)?prescrib(e|ing)\b/i,
  ],
  /**
   * Unhedged certainty in an output. Not blocked — the §3.3 remedy is to
   * append the standard uncertainty line, because over-confident phrasing is
   * a tone problem, not a safety incident.
   */
  clinicalCertainty: [
    /\b(pasti|sudah\s+pasti|dipastikan|tidak\s+perlu\s+(ke\s+)?dokter)\b/i,
    /\b(definitely|certainly|guaranteed|no\s+need\s+to\s+see\s+a\s+doctor)\b/i,
    /\b(100|seratus)\s*%\s*(pasti|yakin|sure|certain)\b/i,
  ],
} as const;
