import type { DocumentCategoryValue } from '#document-management/schemas';
import type { NonCapitationServiceTypeValue } from '#bpjs-non-capitation/schemas';

const ANTENATAL: readonly DocumentCategoryValue[] = ['KIA_BOOK_COPY'];
const DELIVERY: readonly DocumentCategoryValue[] = [
  'KIA_BOOK_COPY',
  'PARTOGRAPH',
  'BIRTH_CERTIFICATE',
];
const LONG_ACTING_FAMILY_PLANNING: readonly DocumentCategoryValue[] = [
  'FAMILY_PLANNING_BOOK',
  'CONSENT_FORM',
];

/**
 * The supporting documents each line needs, by the category they are filed
 * under (P25-T16), from Peraturan BPJS 7/2018 Pasal 13–14, pp. 11–12:
 * the KIA sheet copy (or signed kartu ibu) for ANC, PNC and pra rujukan
 * (Pasal 13 huruf b); the referral letter for pra rujukan; the KIA copy,
 * partograf and surat keterangan kelahiran for a delivery (Pasal 14 huruf b);
 * the KB book, and for implant and IUD the signed consent (Pasal 13 huruf d).
 * The FPK, kuitansi and SPTJM are the induk's own and are not listed.
 */
export const NON_CAPITATION_DOCUMENT_REQUIREMENTS: Readonly<
  Record<NonCapitationServiceTypeValue, readonly DocumentCategoryValue[]>
> = {
  ANTENATAL_MIDWIFE: ANTENATAL,
  ANTENATAL_DOCTOR: ANTENATAL,
  ANTENATAL_DOCTOR_ULTRASOUND: ANTENATAL,
  PRE_REFERRAL: ['KIA_BOOK_COPY', 'REFERRAL_LETTER'],
  DELIVERY_WITH_DOCTOR: DELIVERY,
  DELIVERY_HEALTH_WORKER_TEAM: DELIVERY,
  POSTNATAL_MOTHER_NEWBORN: ANTENATAL,
  POSTNATAL_MOTHER: ANTENATAL,
  FAMILY_PLANNING_IUD: LONG_ACTING_FAMILY_PLANNING,
  FAMILY_PLANNING_IMPLANT: LONG_ACTING_FAMILY_PLANNING,
  FAMILY_PLANNING_INJECTION: ['FAMILY_PLANNING_BOOK'],
};
