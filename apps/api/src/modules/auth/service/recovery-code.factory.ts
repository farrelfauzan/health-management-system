import { randomBytes } from 'node:crypto';

/**
 * Crockford base32 without `i`, `l`, `o` or `u`: no character in this set can
 * be mistaken for another when read off a printed sheet, which is the only way
 * a recovery code is ever consumed.
 */
const CODE_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

const GROUP_LENGTH = 5;
const GROUPS_PER_CODE = 3;
const CODE_LENGTH = GROUP_LENGTH * GROUPS_PER_CODE;

/**
 * The largest multiple of the alphabet size that fits in a byte. Bytes at or
 * above it are discarded rather than reduced modulo 32 — 256 is a multiple of
 * 32, so no bias exists here today, but the rejection makes the property hold
 * if the alphabet is ever changed to a size that does not divide 256.
 */
const REJECTION_CEILING = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;

function drawCharacters(count: number): string {
  const characters: string[] = [];
  while (characters.length < count) {
    for (const byte of randomBytes(count)) {
      if (byte >= REJECTION_CEILING) {
        continue;
      }
      characters.push(CODE_ALPHABET[byte % CODE_ALPHABET.length]!);
      if (characters.length === count) {
        break;
      }
    }
  }
  return characters.join('');
}

/**
 * Mints one recovery code, `xxxxx-xxxxx-xxxxx`, 75 bits from the CSPRNG.
 *
 * Grouped with hyphens purely so a human can keep their place while typing —
 * the separators are not part of the entropy and are stripped before hashing.
 */
export function createRecoveryCode(): string {
  const characters = drawCharacters(CODE_LENGTH);
  const groups: string[] = [];
  for (let offset = 0; offset < CODE_LENGTH; offset += GROUP_LENGTH) {
    groups.push(characters.slice(offset, offset + GROUP_LENGTH));
  }
  return groups.join('-');
}
