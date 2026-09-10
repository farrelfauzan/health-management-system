import {
  INDONESIAN_PHONE_COUNTRY_CODE,
  INDONESIAN_PHONE_NUMBER_PATTERN,
  normalizePhoneNumber,
} from '#shared/phone-number';

const NATIONAL_PREFIX_GROUP_LENGTH = 3;
const NATIONAL_GROUP_LENGTH = 4;
const MOBILE_NATIONAL_LENGTH = 11;

function splitIntoGroups(nationalDigits: string): string[] {
  if (nationalDigits.length === MOBILE_NATIONAL_LENGTH) {
    return [
      nationalDigits.slice(0, NATIONAL_PREFIX_GROUP_LENGTH),
      nationalDigits.slice(
        NATIONAL_PREFIX_GROUP_LENGTH,
        NATIONAL_PREFIX_GROUP_LENGTH + NATIONAL_GROUP_LENGTH,
      ),
      nationalDigits.slice(NATIONAL_PREFIX_GROUP_LENGTH + NATIONAL_GROUP_LENGTH),
    ];
  }
  const groups: string[] = [];
  for (let index = 0; index < nationalDigits.length; index += NATIONAL_GROUP_LENGTH) {
    groups.push(nationalDigits.slice(index, index + NATIONAL_GROUP_LENGTH));
  }
  return groups;
}

/**
 * Renders a stored phone number the way a receptionist reads one out:
 * `+62 812-3456-7890`.
 *
 * The one display helper for every table, detail card and drawer that prints a
 * number, so a record does not read `6281234567890` in one place and
 * `+62 812-3456-7890` in another. Grouping is 3-4-4 for the eleven-digit
 * mobile numbers that are almost all of them, and plain groups of four for
 * anything else, because guessing a landline's area-code boundary would print
 * a number that looks wrong to the person who dials it.
 *
 * Anything that is not a canonical Indonesian number — a legacy row the
 * backfill could not normalise, a blank, a foreign number — is returned
 * trimmed and untouched. Displaying what is stored is honest; reformatting a
 * number this module does not understand is not.
 */
export function formatPhoneNumber(storedPhoneNumber: string): string {
  const normalised = normalizePhoneNumber(storedPhoneNumber);
  if (!INDONESIAN_PHONE_NUMBER_PATTERN.test(normalised)) {
    return storedPhoneNumber.trim();
  }
  const nationalDigits = normalised.slice(INDONESIAN_PHONE_COUNTRY_CODE.length);
  return `+${INDONESIAN_PHONE_COUNTRY_CODE} ${splitIntoGroups(nationalDigits).join('-')}`;
}
