import { shouldShowTaxInclusiveNote } from './should-show-tax-inclusive-note';

/** P27-T04: the note is true only when the invoice carries PPN. */
describe('shouldShowTaxInclusiveNote', () => {
  it('shows the note for an invoice with PPN and hides it otherwise', () => {
    expect(shouldShowTaxInclusiveNote(11_000)).toBe(true);
    expect(shouldShowTaxInclusiveNote(0)).toBe(false);
  });
});
