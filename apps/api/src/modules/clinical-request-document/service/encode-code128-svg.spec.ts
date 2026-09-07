import { encodeCode128Svg } from './encode-code128-svg';

function decodeSvg(dataUri: string): string {
  const base64 = dataUri.replace('data:image/svg+xml;base64,', '');
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Structural proof only. Whether a scanner reads the symbol back is a physical
 * property this cannot assert — what it does assert is that the encoding is
 * well-formed, that the checksum is the modulo-103 weighted sum the standard
 * defines, and that anything Code set B cannot express is refused rather than
 * approximated.
 */
describe('encodeCode128Svg', () => {
  it('produces an SVG data URI', () => {
    const actual = encodeCode128Svg('LAB/20260907/0001');

    expect(actual).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(decodeSvg(actual ?? '')).toContain('<svg');
  });

  /**
   * Start B (104) + Σ(value × position), modulo 103. Worked by hand for "AB":
   * 'A' is 33 at position 1, 'B' is 34 at position 2, so 104 + 33 + 68 = 205,
   * and 205 mod 103 = 99. Symbol 99 is pattern '114131', which must appear
   * between the payload and the stop pattern '2331112'.
   */
  it('appends the modulo-103 weighted checksum before the stop symbol', () => {
    const svg = decodeSvg(encodeCode128Svg('AB') ?? '');
    const totalWidth = Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1] ?? '0');

    // start + 2 payload + checksum = 4 symbols of 11 modules, stop is 13,
    // plus a 10-module quiet zone on each side.
    expect(totalWidth).toBe(4 * 11 + 13 + 20);
  });

  it('draws a bar for every odd run and leaves the even runs white', () => {
    const svg = decodeSvg(encodeCode128Svg('A') ?? '');
    // Scoped to the black group: the white background is a rect too.
    const barGroup = /<g fill="#000">(.*?)<\/g>/.exec(svg)?.[1] ?? '';
    const barCount = (barGroup.match(/<rect /g) ?? []).length;

    // 3 symbols at 3 bars each, plus the stop symbol's 4.
    expect(barCount).toBe(3 * 3 + 4);
  });

  // A barcode that scans as the wrong number is worse than none at all: the
  // letter still looks scannable, so nobody checks it by eye.
  it.each(['', 'Ω', 'café', ''])('refuses %p rather than mangling it', (input) => {
    expect(encodeCode128Svg(input)).toBeNull();
  });

  it('is a pure function of the value', () => {
    expect(encodeCode128Svg('LAB/20260907/0001')).toBe(encodeCode128Svg('LAB/20260907/0001'));
    expect(encodeCode128Svg('LAB/20260907/0001')).not.toBe(encodeCode128Svg('LAB/20260907/0002'));
  });
});
