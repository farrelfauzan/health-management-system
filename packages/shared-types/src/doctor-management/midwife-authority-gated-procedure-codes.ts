import type { DoctorAuthorityKindValue } from '#doctor-management/schemas';

/**
 * ICD-9-CM procedure codes a midwife may record only while she holds the
 * named delegated authority (P25-T03, FR-AUTH-02). Exact codes, compared
 * after trimming — nothing is matched by prefix.
 *
 * The list is deliberately short. P25-T01 (PR #368, midwife practice research
 * §4) found no ICD-9-CM code for a contraceptive implant, so implants are
 * gated by the procedure's explicit `contraceptiveImplantAction` instead,
 * until P25-T14's method-based gate ships. `99.23`, `97.89`, `86.05`, `86.09`
 * and `99.24` are **not** gated: none of them names an IUD, and gating them
 * would refuse injections and minor wound care a midwife does on her own
 * authority.
 */
export const MIDWIFE_AUTHORITY_GATED_PROCEDURE_CODES: Readonly<
  Record<string, DoctorAuthorityKindValue>
> = {
  /**
   * 69.7 "Insertion of contraceptive device" — `icd9cm.sql` line 2721.
   * IUD insertion is delegated, not own, authority: Permenkes 28/2017
   * Pasal 25(1)(a), still in force through Permenkes 13/2025 Pasal 305(1),
   * and PP 28/2024 Pasal 744(2)(b).
   */
  '69.7': 'IUD_IMPLANT',
  /**
   * 97.71 "Removal of intrauterine contraceptive device" — `icd9cm.sql`
   * line 4546. Removal belongs to the same service as insertion: Permenkes
   * 21/2021 Pasal 1 angka 5 defines AKDR/implant service as "pemasangan atau
   * pencabutan".
   */
  '97.71': 'IUD_IMPLANT',
};
