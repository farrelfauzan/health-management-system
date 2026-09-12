import { buildNotionRichText } from './build-notion-rich-text';

const MAX_RICH_TEXT_LENGTH = 2000;

describe('buildNotionRichText', () => {
  it('returns nothing for an empty string', () => {
    expect(buildNotionRichText('')).toEqual([]);
  });

  it('keeps a short string in one object', () => {
    expect(buildNotionRichText('Tombol simpan tidak berfungsi')).toEqual([
      { type: 'text', text: { content: 'Tombol simpan tidak berfungsi' } },
    ]);
  });

  it('keeps a string at exactly the limit in one object', () => {
    const inputText = 'a'.repeat(MAX_RICH_TEXT_LENGTH);
    const actualRichText = buildNotionRichText(inputText);
    expect(actualRichText).toHaveLength(1);
    expect(actualRichText[0]?.text.content).toHaveLength(MAX_RICH_TEXT_LENGTH);
  });

  it('splits one character past the limit', () => {
    const actualRichText = buildNotionRichText('a'.repeat(MAX_RICH_TEXT_LENGTH + 1));
    expect(actualRichText).toHaveLength(2);
    expect(actualRichText[0]?.text.content).toHaveLength(MAX_RICH_TEXT_LENGTH);
    expect(actualRichText[1]?.text.content).toBe('a');
  });

  it('never splits a surrogate pair across two objects', () => {
    const inputText = `${'a'.repeat(MAX_RICH_TEXT_LENGTH - 1)}😀tail`;
    const actualRichText = buildNotionRichText(inputText);
    expect(actualRichText[0]?.text.content).toHaveLength(MAX_RICH_TEXT_LENGTH - 1);
    expect(actualRichText[1]?.text.content).toBe('😀tail');
    expect(actualRichText.map((richText) => richText.text.content).join('')).toBe(inputText);
  });

  it('never splits a multi-codepoint emoji sequence', () => {
    const inputEmoji = '👩‍⚕️';
    const inputText = `${'a'.repeat(MAX_RICH_TEXT_LENGTH - 2)}${inputEmoji}`;
    const actualRichText = buildNotionRichText(inputText);
    expect(actualRichText).toHaveLength(2);
    expect(actualRichText[1]?.text.content).toBe(inputEmoji);
  });

  it('keeps every object within the limit and loses nothing', () => {
    const inputText = 'panjang '.repeat(1200);
    const actualRichText = buildNotionRichText(inputText);
    for (const richText of actualRichText) {
      expect(richText.text.content.length).toBeLessThanOrEqual(MAX_RICH_TEXT_LENGTH);
    }
    expect(actualRichText.map((richText) => richText.text.content).join('')).toBe(inputText);
  });
});
