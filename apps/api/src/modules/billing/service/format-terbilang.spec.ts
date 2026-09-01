import fc from 'fast-check';

import { formatTerbilang } from './format-terbilang';

const MAX_AMOUNT = 999_999_999_999_999;
/** The range the ticket asks the property to hold over. */
const PROPERTY_MAX = 1_000_000_000_000;

const UNIT_BY_WORD: Readonly<Record<string, number>> = {
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
};

const SCALE_BY_WORD: Readonly<Record<string, number>> = {
  ribu: 1_000,
  juta: 1_000_000,
  miliar: 1_000_000_000,
  triliun: 1_000_000_000_000,
};

/**
 * An independent reader for the words, written from the grammar rather than
 * from the formatter. Round-tripping through it is what makes the property
 * evidence: two implementations that disagree fail the test, and a shared
 * misunderstanding is the only way both can be wrong together.
 */
function parseTerbilang(words: string): number {
  const tokens = words.replace(/ rupiah$/, '').split(' ');
  if (tokens.length === 1 && tokens[0] === 'nol') {
    return 0;
  }
  let total = 0;
  let group = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] as string;
    const next = tokens[index + 1];
    if (token === 'seratus') {
      group += 100;
    } else if (token === 'seribu') {
      total += 1_000;
    } else if (token === 'sepuluh') {
      group += 10;
    } else if (token === 'sebelas') {
      group += 11;
    } else if (token === 'belas') {
      continue;
    } else if (token in SCALE_BY_WORD) {
      total += group * (SCALE_BY_WORD[token] as number);
      group = 0;
    } else if (token in UNIT_BY_WORD) {
      const unit = UNIT_BY_WORD[token] as number;
      if (next === 'ratus') {
        group += unit * 100;
        index += 1;
      } else if (next === 'puluh') {
        group += unit * 10;
        index += 1;
      } else if (next === 'belas') {
        group += unit + 10;
      } else {
        group += unit;
      }
    } else if (token !== 'ratus' && token !== 'puluh') {
      throw new Error(`unparseable token "${token}" in "${words}"`);
    }
  }
  return total + group;
}

describe('formatTerbilang', () => {
  it('spells the acceptance-criteria amount', () => {
    expect(formatTerbilang(275_000)).toBe('dua ratus tujuh puluh lima ribu rupiah');
  });

  it.each([
    [0, 'nol rupiah'],
    [1, 'satu rupiah'],
    [10, 'sepuluh rupiah'],
    [11, 'sebelas rupiah'],
    [12, 'dua belas rupiah'],
    [19, 'sembilan belas rupiah'],
    [20, 'dua puluh rupiah'],
    [21, 'dua puluh satu rupiah'],
    // The `se-` forms, which is where terbilang is usually got wrong.
    [100, 'seratus rupiah'],
    [101, 'seratus satu rupiah'],
    [200, 'dua ratus rupiah'],
    [1_000, 'seribu rupiah'],
    [1_100, 'seribu seratus rupiah'],
    [11_000, 'sebelas ribu rupiah'],
    [100_000, 'seratus ribu rupiah'],
    [2_000, 'dua ribu rupiah'],
    // The contraction stops at ribu: one million is "satu juta", not
    // "sejuta", in the written form an invoice carries.
    [1_000_000, 'satu juta rupiah'],
    [1_000_000_000, 'satu miliar rupiah'],
    [1_000_000_000_000, 'satu triliun rupiah'],
    [275_000, 'dua ratus tujuh puluh lima ribu rupiah'],
    [1_234_567, 'satu juta dua ratus tiga puluh empat ribu lima ratus enam puluh tujuh rupiah'],
  ])('spells %d', (amount, expected) => {
    expect(formatTerbilang(amount)).toBe(expected);
  });

  it('round-trips every amount from 0 to 10^12 (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: PROPERTY_MAX }), (amount) => {
        expect(parseTerbilang(formatTerbilang(amount))).toBe(amount);
      }),
      { numRuns: 3_000 },
    );
  });

  it('round-trips exhaustively below one thousand, where every irregular form lives', () => {
    for (let amount = 0; amount <= 999; amount += 1) {
      expect(parseTerbilang(formatTerbilang(amount))).toBe(amount);
    }
  });

  it('never emits a digit, so the words are always words (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: PROPERTY_MAX }), (amount) => {
        expect(formatTerbilang(amount)).not.toMatch(/[0-9]/);
      }),
      { numRuns: 1_000 },
    );
  });

  it('never emits a doubled or trailing space (property)', () => {
    // A missing group would show up as one — `spellGroups` skips zero groups,
    // and this is what proves the skip does not leave a gap behind.
    fc.assert(
      fc.property(fc.integer({ min: 0, max: PROPERTY_MAX }), (amount) => {
        const actual = formatTerbilang(amount);
        expect(actual).toBe(actual.trim());
        expect(actual).not.toContain('  ');
      }),
      { numRuns: 1_000 },
    );
  });

  it('refuses amounts it has no words for', () => {
    expect(() => formatTerbilang(-1)).toThrow(RangeError);
    expect(() => formatTerbilang(1.5)).toThrow(RangeError);
    expect(() => formatTerbilang(MAX_AMOUNT + 1)).toThrow(RangeError);
    expect(() => formatTerbilang(Number.NaN)).toThrow(RangeError);
  });

  it('spells the largest amount it accepts', () => {
    expect(formatTerbilang(MAX_AMOUNT)).toBe(
      'sembilan ratus sembilan puluh sembilan triliun sembilan ratus sembilan puluh sembilan miliar sembilan ratus sembilan puluh sembilan juta sembilan ratus sembilan puluh sembilan ribu sembilan ratus sembilan puluh sembilan rupiah',
    );
  });
});
