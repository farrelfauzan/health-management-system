import { MANAGED_DOCUMENT_PREVIEW_MAX_CHARACTERS } from '@hms/shared-types';

import { readDocumentPreviewText } from './read-document-preview-text';

describe('readDocumentPreviewText', () => {
  it('returns Markdown text with every tag stripped', async () => {
    const actual = await readDocumentPreviewText({
      content: Buffer.from('# Judul\n\n<b>tebal</b> teks'),
      mimeType: 'text/markdown',
    });

    expect(actual.text).toBe('# Judul\n\ntebal teks');
    expect(actual.isTruncated).toBe(false);
  });

  it('caps a long document and says so', async () => {
    const inputText = 'kata '.repeat(MANAGED_DOCUMENT_PREVIEW_MAX_CHARACTERS);

    const actual = await readDocumentPreviewText({
      content: Buffer.from(inputText),
      mimeType: 'text/plain',
    });

    expect(actual.isTruncated).toBe(true);
    expect(actual.characterCount).toBeLessThanOrEqual(MANAGED_DOCUMENT_PREVIEW_MAX_CHARACTERS);
    expect(actual.totalCharacterCount).toBe(inputText.length);
  });
});
