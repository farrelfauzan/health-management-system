/**
 * What replaces a reply the §4.7.2 guard refused.
 *
 * It says the lookup did not happen rather than apologising for an error,
 * because that is the true and actionable thing: the assistant had the tool,
 * did not use it, and the number it produced instead is not evidence. Asking
 * again is a reasonable next step and is what the copy suggests.
 *
 * Deliberately **carries no digit**, so it cannot trip the very patterns it
 * travels with — the same discipline the clinical-judgement notice follows.
 */
export const AI_CHAT_UNSOURCED_CLAIM_REPLY = [
  'Maaf, saya tidak melakukan pencarian data untuk pertanyaan itu, jadi saya tidak dapat menyebutkan angkanya. Silakan tanyakan lagi secara spesifik agar saya mencari langsung ke sistem klinik.',
  '',
  'Sorry — I did not look this up in the clinic system, so I cannot state a figure for it. Please ask again specifically so the lookup runs against live data.',
].join('\n');
