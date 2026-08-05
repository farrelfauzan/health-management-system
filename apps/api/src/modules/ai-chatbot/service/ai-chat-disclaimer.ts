import type { ChatChannelValue } from '@hms/shared-types';

/**
 * The mandatory disclaimer (§3.1 rule 3), per channel, Indonesian first
 * because patients are the primary channel. It is returned in the response
 * envelope's `meta` rather than concatenated into the assistant content: a
 * model cannot edit it away, a client cannot render the reply without
 * receiving it, and the persisted `disclaimerShown` flag proves per message
 * that it was shown.
 *
 * The ADMIN line is a different sentence rather than the clinical one
 * repeated, for the same reason §2.1.2 keeps the clinical safety copy out of
 * that channel's system prompt: telling an administrator to consult a
 * healthcare professional about a queue count is noise, and noise on every
 * turn is what teaches someone to stop reading the disclaimers that do
 * matter. What an operations answer needs qualifying is its freshness and its
 * authority — the figures are a point-in-time read, and the HMS screen behind
 * them is the record.
 */
export const AI_CHAT_DISCLAIMERS: Readonly<Record<ChatChannelValue, string>> = {
  PATIENT:
    'Informasi ini bukan diagnosis medis. Konsultasikan dengan tenaga kesehatan. / This information is not a medical diagnosis. Please consult a healthcare professional.',
  DOCTOR:
    'Informasi ini bukan diagnosis medis. Konsultasikan dengan tenaga kesehatan. / This information is not a medical diagnosis. Please consult a healthcare professional.',
  ADMIN:
    'Angka operasional dibaca dari HMS saat pertanyaan diajukan; periksa layar HMS terkait sebelum mengambil keputusan. / Operational figures are read from HMS at the time of the question; check the relevant HMS screen before acting on them.',
};
