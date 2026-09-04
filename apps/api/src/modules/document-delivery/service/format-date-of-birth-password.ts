import { DeliveryPasswordSourceValue } from '@hms/shared-types';

const TWO_DIGITS = 2;
const FOUR_DIGITS = 4;

/**
 * A date of birth as the password the message will describe (`P16-T37`,
 * FR-E4-06). Read in UTC because `PatientProfile.dateOfBirth` is a
 * date-only column that Prisma surfaces as UTC midnight; the clinic's time
 * zone is irrelevant to a field that carries no time.
 *
 * Zero-padded, so the 7th of March is `07031988` and not `731988` — the
 * message says "DDMMYYYY", and the format must be exactly what it says.
 */
export function formatDateOfBirthPassword(
  dateOfBirth: Date,
  source: Extract<DeliveryPasswordSourceValue, 'DOB_DDMMYYYY' | 'DOB_YYYYMMDD'>,
): string {
  const day = String(dateOfBirth.getUTCDate()).padStart(TWO_DIGITS, '0');
  const month = String(dateOfBirth.getUTCMonth() + 1).padStart(TWO_DIGITS, '0');
  const year = String(dateOfBirth.getUTCFullYear()).padStart(FOUR_DIGITS, '0');
  return source === 'DOB_DDMMYYYY' ? `${day}${month}${year}` : `${year}${month}${day}`;
}
