/**
 * Appended to a doctor-channel assistant turn that matched the diagnosis
 * patterns (ai-chatbot-tools.md §2.3). The reply survives: the no-diagnosis
 * rule exists to keep unlicensed medical advice away from a layperson, and a
 * licensed clinician is not one — the turn is still tagged, but the remedy is
 * a reminder rather than a discarded answer. The wording deliberately avoids
 * the §3.3 certainty and diagnosis patterns it travels alongside, so the
 * notice can never re-trigger the guards it accompanies.
 */
export const AI_CHAT_CLINICAL_JUDGEMENT_NOTICE = [
  'Catatan: informasi di atas tidak menggantikan penilaian klinis Anda.',
  'Keputusan diagnosis tetap berada pada dokter yang memeriksa pasien.',
  '',
  'Note: the information above does not replace your clinical judgement.',
  'The diagnostic decision remains with the examining clinician.',
].join('\n');
