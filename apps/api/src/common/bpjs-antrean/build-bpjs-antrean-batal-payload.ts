import { BpjsAntreanBatalPayload } from './bpjs-antrean-submission.types';
import { formatBpjsAntreanDate } from './format-bpjs-antrean-date';

const MAX_REASON_LENGTH = 255;
const DEFAULT_REASON = 'Registrasi dibatalkan oleh fasilitas kesehatan';

type BuildBpjsAntreanBatalPayloadOptions = {
  readonly examinationDate: Date;
  readonly poliCode: string;
  readonly cardNumber: string;
  readonly reason?: string | null;
};

/**
 * Builds the `antrean/batal` body that withdraws a queue entry the clinic
 * published (P14-T05).
 *
 * A reason is always sent. BPJS shows it to the member whose queue number
 * just disappeared from their phone, so an empty string would be the worst
 * possible answer — the default says who cancelled it, and a recorded
 * cancellation note replaces it when the front desk gave one.
 */
export function buildBpjsAntreanBatalPayload(
  options: BuildBpjsAntreanBatalPayloadOptions,
): BpjsAntreanBatalPayload {
  const reason = options.reason?.trim();
  return {
    tanggalperiksa: formatBpjsAntreanDate(options.examinationDate),
    kodepoli: options.poliCode,
    nomorkartu: options.cardNumber,
    alasan:
      reason === undefined || reason === ''
        ? DEFAULT_REASON
        : reason.slice(0, MAX_REASON_LENGTH),
  };
}
