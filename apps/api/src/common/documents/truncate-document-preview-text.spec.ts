import { truncateDocumentPreviewText } from './truncate-document-preview-text';

describe('truncateDocumentPreviewText', () => {
  it('returns a short document whole and says it was not truncated', () => {
    const inputText = 'Kebijakan singkat.';
    const actualResult = truncateDocumentPreviewText({ text: inputText, limit: 100 });
    expect(actualResult).toEqual({
      text: inputText,
      characterCount: 18,
      totalCharacterCount: 18,
      isTruncated: false,
    });
  });

  it('treats a document sitting exactly on the cap as complete', () => {
    const inputText = 'a'.repeat(50);
    const actualResult = truncateDocumentPreviewText({ text: inputText, limit: 50 });
    expect(actualResult.isTruncated).toBe(false);
    expect(actualResult.text).toBe(inputText);
  });

  it('cuts one character past the cap and reports both counts', () => {
    const inputText = 'a'.repeat(51);
    const actualResult = truncateDocumentPreviewText({ text: inputText, limit: 50 });
    expect(actualResult.isTruncated).toBe(true);
    expect(actualResult.characterCount).toBe(50);
    expect(actualResult.totalCharacterCount).toBe(51);
  });

  it('backs the cut off to the last whitespace so no word is halved', () => {
    const inputText = 'satu dua tiga empat lima';
    const actualResult = truncateDocumentPreviewText({ text: inputText, limit: 12 });
    expect(actualResult.text).toBe('satu dua');
    expect(actualResult.isTruncated).toBe(true);
    expect(actualResult.totalCharacterCount).toBe(24);
  });

  it('cuts hard when the lookback finds no whitespace to land on', () => {
    const inputText = 'x'.repeat(400);
    const actualResult = truncateDocumentPreviewText({ text: inputText, limit: 100 });
    expect(actualResult.text).toBe('x'.repeat(100));
    expect(actualResult.characterCount).toBe(100);
    expect(actualResult.isTruncated).toBe(true);
  });

  it('cuts hard rather than returning nothing when the cap lands inside the first word', () => {
    const inputText = ` ${'y'.repeat(400)}`;
    const actualResult = truncateDocumentPreviewText({ text: inputText, limit: 10 });
    expect(actualResult.text).toBe(` ${'y'.repeat(9)}`);
    expect(actualResult.isTruncated).toBe(true);
  });

  it('counts characters rather than UTF-16 units, so an emoji costs one', () => {
    const inputText = '👩‍⚕️';
    const actualResult = truncateDocumentPreviewText({ text: inputText, limit: 1_000 });
    expect(actualResult.totalCharacterCount).toBe([...inputText].length);
    expect(actualResult.isTruncated).toBe(false);
  });

  it('trims the trailing whitespace it cut on', () => {
    const actualResult = truncateDocumentPreviewText({
      text: 'baris satu\nbaris dua sekali lagi',
      limit: 14,
    });
    expect(actualResult.text).toBe('baris satu');
  });

  it('returns an empty result for empty text', () => {
    const actualResult = truncateDocumentPreviewText({ text: '', limit: 100 });
    expect(actualResult).toEqual({
      text: '',
      characterCount: 0,
      totalCharacterCount: 0,
      isTruncated: false,
    });
  });
});
