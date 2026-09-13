import { SatusehatNikSuffixCheckValue } from '@hms/shared-types';

const DIGIT_PATTERN = /^[0-9]$/;

/**
 * Compares the digits SATUSEHAT leaves visible in a masked NIK with the NIK we
 * store (P21-T08).
 *
 * The platform masks all but the last three digits (`*************ddd`, probed
 * live), so a match is weak evidence and a mismatch is conclusive. Positions
 * are compared rather than a fixed suffix length, so a platform that one day
 * shows more or fewer digits is still read correctly. A value of another
 * length, or one with nothing visible, is `UNAVAILABLE` rather than a guess.
 */
export function checkMaskedNikSuffix(input: {
  maskedNik: string | null;
  storedNik: string | null;
}): SatusehatNikSuffixCheckValue {
  const { maskedNik, storedNik } = input;
  if (maskedNik === null || storedNik === null || maskedNik.length !== storedNik.length) {
    return 'UNAVAILABLE';
  }
  const visiblePositions = [...maskedNik]
    .map((character, index) => (DIGIT_PATTERN.test(character) ? index : -1))
    .filter((index) => index >= 0);
  if (visiblePositions.length === 0) {
    return 'UNAVAILABLE';
  }
  return visiblePositions.every((index) => maskedNik[index] === storedNik[index])
    ? 'MATCHES'
    : 'DIFFERS';
}
