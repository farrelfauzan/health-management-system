import { describe, expect, it } from 'vitest';

import { parseMarkdownBlock } from '#lib/ai-assistant/parse-markdown-block';

describe('parseMarkdownBlock', () => {
  it('reads a dashed chunk as a bullet list, markers stripped', () => {
    const actual = parseMarkdownBlock('- Amoxicillin\n- Paracetamol');

    expect(actual).toEqual({ kind: 'BULLETS', items: ['Amoxicillin', 'Paracetamol'] });
  });

  it('reads a numbered chunk as an ordered list', () => {
    const actual = parseMarkdownBlock('1. Cek stok\n2) Hubungi apotek');

    expect(actual).toEqual({ kind: 'NUMBERS', items: ['Cek stok', 'Hubungi apotek'] });
  });

  it('reads a hash line as a heading', () => {
    const actual = parseMarkdownBlock('### Ringkasan');

    expect(actual).toEqual({ kind: 'HEADING', text: 'Ringkasan' });
  });

  it('keeps prose that merely mentions a number as a paragraph', () => {
    // A sentence starting "1." inside prose is a sentence. Promoting it would
    // re-flow the reply into a shape the model did not write.
    const actual = parseMarkdownBlock('Ada 3 batch.\n1. yang pertama sudah kedaluwarsa');

    expect(actual).toEqual({
      kind: 'PARAGRAPH',
      lines: ['Ada 3 batch.', '1. yang pertama sudah kedaluwarsa'],
    });
  });

  it('keeps the line breaks inside a paragraph', () => {
    const actual = parseMarkdownBlock('Baris satu\nBaris dua');

    expect(actual).toEqual({ kind: 'PARAGRAPH', lines: ['Baris satu', 'Baris dua'] });
  });
});
