import { DeliveryPasswordSourceValue } from '@hms/shared-types';

/**
 * The sentence that tells the recipient how to open the file without saying
 * what the password is (`P16-T37`, FR-E4-08). Indonesian first, English
 * after, like every template on the channel.
 *
 * Fixed strings on purpose: nothing about the patient is interpolated, so
 * there is no way for a value to slip in. The password itself is never an
 * input here.
 */
const SCHEME_SENTENCES: Readonly<Record<DeliveryPasswordSourceValue, string>> = {
  DOB_DDMMYYYY:
    'Buka dokumen ini dengan kata sandi berupa tanggal lahir Anda, format DDMMYYYY (tanggal-bulan-tahun, 8 angka). / Open this file with your date of birth as the password, DDMMYYYY.',
  DOB_YYYYMMDD:
    'Buka dokumen ini dengan kata sandi berupa tanggal lahir Anda, format YYYYMMDD (tahun-bulan-tanggal, 8 angka). / Open this file with your date of birth as the password, YYYYMMDD.',
  MRN: 'Buka dokumen ini dengan kata sandi berupa nomor rekam medis Anda, seperti tertera pada kartu pasien. / Open this file with your medical record number as the password, as printed on your patient card.',
};

export function describePasswordScheme(source: DeliveryPasswordSourceValue): string {
  return SCHEME_SENTENCES[source];
}
