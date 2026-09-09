const INDONESIA_COUNTRY_CODE = '62';

/**
 * Shows a stored chat number the way a person reads it: `+62 8123456789`.
 *
 * The prospective table holds numbers already normalised by the API (digits
 * only, national prefix rewritten to `62`), so this only has to put the plus
 * and the space back. A number that somehow still leads with `0` is treated as
 * national, and a number in some other country code keeps it.
 *
 * Deliberately minimal and local to this table: `P19-T09` adds a shared
 * `formatPhoneNumber` to `@hms/shared-types` on another branch, and this cell
 * switches to it once that lands.
 */
export function formatProspectivePhoneNumber(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length === 0) {
    return phoneNumber;
  }
  if (digits.startsWith(INDONESIA_COUNTRY_CODE)) {
    return `+${INDONESIA_COUNTRY_CODE} ${digits.slice(INDONESIA_COUNTRY_CODE.length)}`;
  }
  if (digits.startsWith('0')) {
    return `+${INDONESIA_COUNTRY_CODE} ${digits.slice(1)}`;
  }
  return `+${digits}`;
}
