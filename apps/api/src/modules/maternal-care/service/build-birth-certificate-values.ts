import { BirthCertificateSubject } from '@hms/shared-types';

/** Shown when the record holds nothing for a token, rather than an empty cell. */
const NOT_RECORDED = '—';
const CLINIC_TIME_ZONE = 'Asia/Jakarta';
const GRAMS_PER_KILOGRAM = 1000;

/**
 * The tokens the surat keterangan lahir is rendered from (P25-T09, FR-INC-05).
 *
 * Everything is read from the delivery and the baby; nothing is typed into the
 * letter. The mother's NIK is **masked to its last four digits**, for the same
 * reason the surat rujukan masks it: this document is carried by hand to a
 * dukcapil counter and read by people the clinic never meets, and her name and
 * the birth identify the baby without it.
 *
 * The birth time is printed in the clinic's timezone. A baby born at 03:10 WIB
 * was born on that date in Indonesia, and rendering the stored instant as UTC
 * would put a birth just after midnight on the previous day — on the document
 * a family takes to register her.
 */
export function buildBirthCertificateValues(
  subject: BirthCertificateSubject,
): Record<string, string> {
  return {
    'mother.fullName': subject.motherName,
    'mother.nikMasked': maskNik(subject.motherNikLast4),
    'baby.fullName': subject.babyName ?? NOT_RECORDED,
    'baby.sex': subject.sex === 'FEMALE' ? 'Perempuan' : 'Laki-laki',
    'baby.birthDate': formatClinicDate(subject.birthAt),
    'baby.birthTime': formatClinicTime(subject.birthAt),
    'baby.birthWeight': formatWeight(subject.birthWeightGrams),
    'baby.birthLength': subject.lengthCm === null ? NOT_RECORDED : `${subject.lengthCm} cm`,
    'baby.birthOrder': subject.birthOrder === null ? NOT_RECORDED : `Anak ke-${subject.birthOrder}`,
    'attendant.fullName': subject.attendantName,
    'attendant.strNumber': subject.attendantStrNumber ?? NOT_RECORDED,
  };
}

/**
 * The last four digits behind asterisks, or a dash when the clinic never held
 * a NIK for her — which is the ordinary case for a woman registered without
 * her card.
 */
function maskNik(nikLast4: string | null): string {
  return nikLast4 === null ? NOT_RECORDED : `************${nikLast4}`;
}

function formatWeight(grams: number | null): string {
  if (grams === null) {
    return NOT_RECORDED;
  }
  return `${grams} gram (${(grams / GRAMS_PER_KILOGRAM).toFixed(2)} kg)`;
}

function formatClinicDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function formatClinicTime(instant: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}
