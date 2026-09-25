import { ClinicLetterhead, formatPhoneNumber } from '@hms/shared-types';

/**
 * The `clinic.*` tokens every printed clinical letter opens with, from the one
 * letterhead the clinic profile hands out.
 *
 * One function for all of them — the resep, the surat pengantar, the hasil
 * laboratorium and the three maternal letters — because the letterhead is the
 * same paper on each, and a builder that forgot a token is how a surat
 * rujukan came to print with an empty header. The logo arrives already inlined
 * as a `data:` URI; a missing one prints a text-only letterhead, which is a
 * complete letter.
 */
export function buildClinicLetterheadValues(letterhead: ClinicLetterhead): Record<string, string> {
  return {
    'clinic.name': letterhead.name,
    'clinic.legalName': letterhead.legalName ?? '',
    'clinic.address': letterhead.address ?? '',
    // Stored canonical (`62221234567`); printed the way a caller dials it.
    'clinic.phone':
      letterhead.phoneNumber === null ? '' : formatPhoneNumber(letterhead.phoneNumber),
    'clinic.email': letterhead.email ?? '',
    'clinic.licenseNumber': letterhead.licenseNumber ?? '',
    'clinic.taxId': letterhead.taxId ?? '',
    'clinic.logo': letterhead.logoDataUri ?? '',
  };
}
