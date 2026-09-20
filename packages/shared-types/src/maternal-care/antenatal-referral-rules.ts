import type { AntenatalReferralRule } from '#maternal-care/types';

/**
 * The findings that prompt "Perlu rujukan" on an antenatal visit (P25-T07,
 * FR-ANC-04).
 *
 * **This list is deliberately empty.** Every rule must cite the page of the
 * *Pedoman Pelayanan Antenatal Terpadu* (Kemenkes, 3rd ed. 2020) or the Buku
 * KIA that its threshold came from, and on 2026-09-20 that document could not
 * be read from a primary source: the repository viewer errors, the
 * perpustakaan PDF answers HTTP 500, and the mirrored copy is a 20-page scan
 * with no text layer. A threshold is a number that sends a mother to a
 * hospital, or fails to; one taken from a search-engine summary is not
 * evidence, and the ticket's own rule is that **a rule without a source is not
 * merged**.
 *
 * So the mechanism ships and the list does not — the same call the product
 * owner made for `AUTHORITY_BOUND` medicines in P25-T05, and for the same
 * reason. `source` is required by the type, so a rule cannot be added later
 * without one.
 *
 * Candidates to verify, recorded here so the follow-up knows what to look for
 * and **not** as commented-out code to uncomment: raised blood pressure, low
 * LiLA, anaemia by haemoglobin, abnormal foetal heart rate, a non-cephalic
 * presentation late in pregnancy, and gestational age past term.
 */
export const ANTENATAL_REFERRAL_RULES: readonly AntenatalReferralRule[] = [];
