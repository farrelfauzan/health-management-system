/**
 * The mandatory disclaimer (§3.1 rule 3), Indonesian first because patients
 * are the primary channel. It is returned in the response envelope's `meta`
 * rather than concatenated into the assistant content: a model cannot edit
 * it away, a client cannot render the reply without receiving it, and the
 * persisted `disclaimerShown` flag proves per message that it was shown.
 */
export const AI_CHAT_DISCLAIMER =
  'Informasi ini bukan diagnosis medis. Konsultasikan dengan tenaga kesehatan. / This information is not a medical diagnosis. Please consult a healthcare professional.';
