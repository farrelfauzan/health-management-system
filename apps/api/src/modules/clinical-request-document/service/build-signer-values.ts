import { ClinicalDocumentSignerRecord } from '@hms/shared-types';

/** Shown when the letter has nobody on record to name, rather than a blank. */
const NOT_RECORDED = '—';

const SIGNATURE_ROLE_BY_PROFESSION: Readonly<
  Record<ClinicalDocumentSignerRecord['profession'], string>
> = {
  DOCTOR: 'Dokter pemeriksa',
  MIDWIFE: 'Bidan pemeriksa',
};

/** A midwife's practice licence is a SIPB; a doctor's is a SIP. */
const PRACTICE_LICENSE_LABEL_BY_PROFESSION: Readonly<
  Record<ClinicalDocumentSignerRecord['profession'], string>
> = {
  DOCTOR: 'SIP',
  MIDWIFE: 'SIPB',
};

const STR_LABEL = 'STR';

const ISO_DATE_LENGTH = 10;

/**
 * The signature block's tokens: who signs, in what capacity, and under which
 * licence.
 *
 * D-032 fixes the flat licence number on a profile as the **STR**. A practice
 * licence (SIP, or a midwife's SIPB) lives in the typed licence list, so the
 * letter prints that when one is in force on `asOf` — the clinic's calendar
 * day — and the STR otherwise, labelled as what it is. Printing "SIP:" beside
 * an STR number, which every letter did before, states something false on a
 * document a hospital counter relies on.
 *
 * An expired practice licence is never printed: a lapsed SIP is not a licence
 * the clinician may sign under, and the lifetime STR is at least true.
 */
export function buildSignerValues(params: {
  signer: ClinicalDocumentSignerRecord | null;
  /** The clinic's calendar day, as `YYYY-MM-DD`. */
  asOfDate: string;
}): Record<string, string> {
  const { signer, asOfDate } = params;
  if (signer === null) {
    return {
      'doctor.fullName': NOT_RECORDED,
      'doctor.signatureRole': SIGNATURE_ROLE_BY_PROFESSION.DOCTOR,
      'doctor.licenseLabel': STR_LABEL,
      'doctor.licenseNumber': NOT_RECORDED,
    };
  }
  const practiceLicense = signer.practiceLicenses.find(
    (license) =>
      license.expiresAt === null ||
      license.expiresAt.toISOString().slice(0, ISO_DATE_LENGTH) >= asOfDate,
  );
  return {
    'doctor.fullName': signer.fullName ?? NOT_RECORDED,
    'doctor.signatureRole': SIGNATURE_ROLE_BY_PROFESSION[signer.profession],
    'doctor.licenseLabel':
      practiceLicense === undefined
        ? STR_LABEL
        : PRACTICE_LICENSE_LABEL_BY_PROFESSION[signer.profession],
    'doctor.licenseNumber': practiceLicense?.licenseNumber ?? signer.strNumber,
  };
}
