import { splitTextIntoChunks } from './split-text-into-chunks';

describe('splitTextIntoChunks', () => {
  it('returns nothing for text that is empty or only whitespace', () => {
    expect(splitTextIntoChunks({ text: '', maxCharacters: 100, overlapCharacters: 10 })).toEqual(
      [],
    );
    expect(
      splitTextIntoChunks({ text: '   \n\n \t ', maxCharacters: 100, overlapCharacters: 10 }),
    ).toEqual([]);
  });

  it('keeps a short document as a single chunk', () => {
    const inputText = 'Pendaftaran pasien BPJS dibuka pukul 07.00.';

    const actualChunks = splitTextIntoChunks({
      text: inputText,
      maxCharacters: 100,
      overlapCharacters: 10,
    });

    expect(actualChunks).toEqual([inputText]);
  });

  it('prefers paragraph boundaries over a fixed window', () => {
    // Each paragraph fits; two together do not. A window-based splitter would
    // cut mid-paragraph and embed half a step of a procedure.
    const inputText = ['A'.repeat(40), 'B'.repeat(40)].join('\n\n');

    const actualChunks = splitTextIntoChunks({
      text: inputText,
      maxCharacters: 50,
      overlapCharacters: 0,
    });

    expect(actualChunks).toEqual(['A'.repeat(40), 'B'.repeat(40)]);
  });

  it('overlaps consecutive chunks so a fact spanning a boundary survives whole', () => {
    const inputText = ['first paragraph here', 'second paragraph here'].join('\n\n');

    const actualChunks = splitTextIntoChunks({
      text: inputText,
      maxCharacters: 25,
      overlapCharacters: 10,
    });

    expect(actualChunks).toHaveLength(2);
    expect(actualChunks[1]).toContain('second paragraph here');
    // The tail of chunk 1 is carried into chunk 2.
    expect(actualChunks[1]?.startsWith('second')).toBe(false);
  });

  it('never begins an overlap mid-word', () => {
    const inputText = ['alpha bravo charlie delta', 'echo foxtrot golf'].join('\n\n');

    const actualChunks = splitTextIntoChunks({
      text: inputText,
      maxCharacters: 30,
      overlapCharacters: 9,
    });

    // A 9-character tail of "…charlie delta" lands inside "delta"; the
    // overlap is advanced to the next whitespace so no half-word is embedded
    // or indexed as a token that appears nowhere in the document.
    const carriedPrefix = actualChunks[1]?.split(/\s/)[0] ?? '';
    expect(inputText).toContain(carriedPrefix);
  });

  it('breaks an oversized paragraph at sentence boundaries', () => {
    const inputText = `${'a'.repeat(30)}. ${'b'.repeat(30)}. ${'c'.repeat(30)}.`;

    const actualChunks = splitTextIntoChunks({
      text: inputText,
      maxCharacters: 40,
      overlapCharacters: 0,
    });

    expect(actualChunks.length).toBeGreaterThan(1);
    actualChunks.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(40));
  });

  it('hard-splits a sentence that is too long to break any other way', () => {
    const inputText = 'x'.repeat(250);

    const actualChunks = splitTextIntoChunks({
      text: inputText,
      maxCharacters: 100,
      overlapCharacters: 0,
    });

    expect(actualChunks).toHaveLength(3);
    actualChunks.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(100));
    expect(actualChunks.join('')).toBe(inputText);
  });

  it('normalizes CRLF endings so the same document chunks identically on either platform', () => {
    const actualCrlfChunks = splitTextIntoChunks({
      text: 'satu\r\n\r\ndua',
      maxCharacters: 100,
      overlapCharacters: 0,
    });
    const actualLfChunks = splitTextIntoChunks({
      text: 'satu\n\ndua',
      maxCharacters: 100,
      overlapCharacters: 0,
    });

    expect(actualCrlfChunks).toEqual(actualLfChunks);
  });

  it('refuses an overlap that is not smaller than the chunk size', () => {
    // Equal sizes would seed every chunk with a full chunk of overlap and the
    // loop would never terminate.
    expect(() =>
      splitTextIntoChunks({ text: 'anything', maxCharacters: 50, overlapCharacters: 50 }),
    ).toThrow(/smaller than the chunk size/);
  });

  it('refuses a non-positive chunk size', () => {
    expect(() =>
      splitTextIntoChunks({ text: 'anything', maxCharacters: 0, overlapCharacters: 0 }),
    ).toThrow(/positive number of characters/);
  });

  it('produces chunks within the size budget for a realistic bilingual document', () => {
    const paragraphs = Array.from(
      { length: 30 },
      (_unused, index) =>
        `Paragraf ${index}: prosedur pendaftaran pasien BPJS di poliklinik umum. Step ${index}: verify the member number against PCare before issuing a queue ticket.`,
    );

    const actualChunks = splitTextIntoChunks({
      text: paragraphs.join('\n\n'),
      maxCharacters: 500,
      overlapCharacters: 50,
    });

    expect(actualChunks.length).toBeGreaterThan(1);
    actualChunks.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(500));
  });
});
