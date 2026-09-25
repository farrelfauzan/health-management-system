import { BirthCertificateSubject, ClinicLetterhead } from '@hms/shared-types';

import { buildClinicLetterheadValues } from '../../clinical-request-document/service/build-clinic-letterhead-values';
import { formatIndonesianDateTime } from '../../clinical-request-document/service/format-indonesian-date-time';

/** Shown when the record holds nothing for a token, rather than an empty cell. */
const NOT_RECORDED = '—';
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
 * a family takes to register her. The date carries its weekday because the
 * letter asks for the *hari* as well as the *tanggal*.
 *
 * The letterhead is the clinic profile's, and the place of birth is the
 * clinic's name and address joined — so a clinic with no address on file
 * prints its name alone rather than a dangling comma.
 */
export function buildBirthCertificateValues(params: {
  subject: BirthCertificateSubject;
  letterhead: ClinicLetterhead;
  timeZone: string;
}): Record<string, string> {
  const { subject, letterhead, timeZone } = params;
  return {
    ...buildClinicLetterheadValues(letterhead),
    'birth.place': [letterhead.name, letterhead.address ?? '']
      .filter((part) => part.trim() !== '')
      .join(', '),
    'mother.fullName': subject.motherName,
    'mother.nikMasked': maskNik(subject.motherNikLast4),
    'baby.fullName': subject.babyName ?? NOT_RECORDED,
    'baby.sex': subject.sex === 'FEMALE' ? 'Perempuan' : 'Laki-laki',
    'baby.birthDate': formatIndonesianDateTime({
      value: subject.birthAt,
      timeZone,
      withTime: false,
      withWeekday: true,
    }),
    'baby.birthTime': formatClinicTime(subject.birthAt, timeZone),
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

function formatClinicTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}
