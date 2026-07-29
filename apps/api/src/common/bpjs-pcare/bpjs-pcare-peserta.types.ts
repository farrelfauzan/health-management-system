/**
 * Wire-level summary of a PCare peserta (member) lookup, normalised by the
 * adapter parser (P11-T04). Only the fields the eligibility card needs are
 * carried through — the raw payload also holds the member's NIK, phone
 * number, and card number, which must never leave the adapter layer.
 */
export type BpjsPcarePesertaSummary = {
  readonly name: string | null;
  readonly isActive: boolean;
  /** BPJS's own readable status text (ketAktif), e.g. "AKTIF" or the inactive reason. */
  readonly statusReason: string | null;
  readonly memberTypeName: string | null;
  readonly memberClassName: string | null;
  readonly providerCode: string | null;
  readonly providerName: string | null;
  readonly isProlanis: boolean;
  readonly isPrb: boolean;
};
