/**
 * What the patient hears back after `STOP` / `BERHENTI` (`P16-T24`,
 * FR-E4-16). Indonesian first, like every template on the channel; short,
 * because it is a confirmation and not a conversation; and it names the
 * counter as the way back, because the keyword revokes consent and only a
 * person can re-capture it.
 */
export const DELIVERY_OPT_OUT_CONFIRMATION = [
  'Baik, kami tidak akan lagi mengirim dokumen (kuitansi, hasil pemeriksaan) ke nomor WhatsApp ini.',
  'Jika Anda ingin menerimanya kembali, sampaikan kepada petugas saat berkunjung ke klinik.',
  '',
  'Understood — we will no longer send documents to this WhatsApp number. Tell the front desk on your next visit if you want to receive them again.',
].join('\n');
