const UNITS = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
] as const;

/**
 * Scale words, smallest first. Indonesian groups by thousands like English,
 * so each group of three digits takes the next word: ribu, juta, miliar,
 * triliun. `''` is the units group.
 */
const SCALES = ['', 'ribu', 'juta', 'miliar', 'triliun'] as const;

const GROUP_SIZE = 1_000;

/**
 * The largest amount this can spell: 999 triliun and change, one below the
 * first quadrillion the scale list has no word for. It is also comfortably
 * above `Number.MAX_SAFE_INTEGER`-adjacent rounding trouble for the integer
 * arithmetic below.
 */
const MAX_TERBILANG_AMOUNT = 999_999_999_999_999;

const CURRENCY_SUFFIX = 'rupiah';

/**
 * Spells a rupiah amount in Indonesian words — the *terbilang* line every
 * Indonesian invoice carries under its total (`P16-T04`).
 *
 * The `se-` forms are the part that is easy to get wrong and the part a
 * reader notices immediately. Indonesian contracts the leading "satu" for
 * three words and only those three: **seratus** (not "satu ratus"),
 * **seribu** (not "satu ribu"), and **sebelas** for eleven. Everything larger
 * keeps its "satu": one million is "satu juta", never "sejuta", in the
 * written form an invoice uses.
 *
 * The contraction applies only to a *leading* one. `1.100` is "seribu
 * seratus"; `2.100` is "dua ribu seratus"; `11.000` is "sebelas ribu", where
 * the eleven contracts but the thousand does not.
 *
 * Amounts are whole rupiah. Sen have not circulated since the 1990s, so a
 * fractional total is a rounding artefact rather than money — the caller
 * rounds and says so, rather than this function inventing a "sen" clause
 * nobody would print.
 */
export function formatTerbilang(amount: number): string {
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_TERBILANG_AMOUNT) {
    throw new RangeError(
      `formatTerbilang expects a whole number between 0 and ${MAX_TERBILANG_AMOUNT}`,
    );
  }
  if (amount === 0) {
    return `nol ${CURRENCY_SUFFIX}`;
  }
  return `${spellGroups(amount)} ${CURRENCY_SUFFIX}`;
}

function spellGroups(amount: number): string {
  const words: string[] = [];
  let remaining = amount;
  let scaleIndex = 0;
  while (remaining > 0) {
    const group = remaining % GROUP_SIZE;
    if (group > 0) {
      words.unshift(spellGroup(group, scaleIndex));
    }
    remaining = Math.floor(remaining / GROUP_SIZE);
    scaleIndex += 1;
  }
  return words.join(' ');
}

function spellGroup(group: number, scaleIndex: number): string {
  const scale = scaleWord(scaleIndex);
  // The single contraction that crosses a group boundary: exactly one
  // thousand is "seribu", while one million stays "satu juta".
  if (group === 1 && scale === 'ribu') {
    return 'seribu';
  }
  const spelled = spellBelowThousand(group);
  return scale === '' ? spelled : `${spelled} ${scale}`;
}

function spellBelowThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  const parts: string[] = [];
  if (hundreds === 1) {
    parts.push('seratus');
  } else if (hundreds > 1) {
    parts.push(`${unitWord(hundreds)} ratus`);
  }
  if (remainder > 0) {
    parts.push(spellBelowHundred(remainder));
  }
  return parts.join(' ');
}

function spellBelowHundred(value: number): string {
  if (value < 10) {
    return unitWord(value);
  }
  if (value === 10) {
    return 'sepuluh';
  }
  if (value === 11) {
    return 'sebelas';
  }
  if (value < 20) {
    return `${unitWord(value - 10)} belas`;
  }
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  const tensWords = `${unitWord(tens)} puluh`;
  return ones === 0 ? tensWords : `${tensWords} ${unitWord(ones)}`;
}

/**
 * Both lookups are in range by construction — the callers derive their index
 * from `% 10` or from the loop that consumed the digits. The throws are
 * unreachable and exist so a future edit that breaks that invariant fails
 * loudly instead of printing `undefined` on an invoice.
 */
function unitWord(digit: number): string {
  const word = UNITS[digit];
  if (word === undefined) {
    throw new RangeError(`No Indonesian unit word for digit ${digit}`);
  }
  return word;
}

function scaleWord(scaleIndex: number): string {
  const word = SCALES[scaleIndex];
  if (word === undefined) {
    throw new RangeError(`No Indonesian scale word at index ${scaleIndex}`);
  }
  return word;
}
