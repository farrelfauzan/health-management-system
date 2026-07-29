import { BpjsPcareObatPayload } from './bpjs-pcare-submission.types';

const DEFAULT_SIGNA = 1;
const FREQUENCY_PATTERN = /(\d{1,2})\s*[xX×]\s*(\d{1,2})/;

type BuildBpjsObatPayloadOptions = {
  readonly noKunjungan: string;
  readonly kdObat: string;
  readonly quantity: number;
  readonly frequency: string | null;
};

/**
 * Builds one obat (dispensed medication) body attached to a submitted
 * kunjungan. PCare's signa pair is parsed from the prescription's free-text
 * dosing when it matches the ubiquitous "3x1" convention; anything else
 * (taper schedules, PRN instructions) falls back to 1×1 — the quantity, not
 * the signa, is what the claim reconciles on.
 */
export function buildBpjsObatPayload(options: BuildBpjsObatPayloadOptions): BpjsPcareObatPayload {
  const signaMatch = options.frequency === null ? null : FREQUENCY_PATTERN.exec(options.frequency);
  return {
    noKunjungan: options.noKunjungan,
    kdObat: options.kdObat,
    signa1: signaMatch === null ? DEFAULT_SIGNA : Number.parseInt(signaMatch[1] ?? '1', 10),
    signa2: signaMatch === null ? DEFAULT_SIGNA : Number.parseInt(signaMatch[2] ?? '1', 10),
    jmlObat: options.quantity,
  };
}
