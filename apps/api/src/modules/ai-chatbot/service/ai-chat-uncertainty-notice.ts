/**
 * Appended to an assistant turn whose language claims more certainty than a
 * non-diagnostic assistant is entitled to (§3.3). The reply survives — the
 * remedy for over-confident phrasing is a correction, not a blocked answer.
 */
export const AI_CHAT_UNCERTAINTY_NOTICE = [
  'Catatan: informasi di atas bersifat umum dan tidak dapat memastikan kondisi Anda.',
  'Hanya pemeriksaan langsung oleh tenaga kesehatan yang dapat memastikannya.',
  '',
  'Note: the information above is general and cannot confirm your condition.',
  'Only an in-person examination by a healthcare professional can do that.',
].join('\n');
