/**
 * P27-T04: the patient's receipt says "Harga sudah termasuk PPN" only when the
 * invoice actually carries PPN. A clinic that is not PKP may not charge it and
 * an invoice of exempt medical services contains none, so the note would be
 * false on either — and the stored `taxAmount` is zero on both.
 */
export function shouldShowTaxInclusiveNote(taxAmount: number): boolean {
  return taxAmount > 0;
}
