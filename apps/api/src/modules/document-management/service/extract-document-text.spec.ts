import { extractDocumentText } from './extract-document-text';

/**
 * A minimal but genuinely valid single-page PDF carrying one text object.
 * Built inline rather than committed as a fixture so the assertion is about
 * the parser reading a real PDF structure, with the expected string visible
 * beside the bytes that encode it.
 */
function buildSinglePagePdf(text: string): Uint8Array {
  const contentStream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  const pdf = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
    `4 0 obj<</Length ${contentStream.length}>>stream`,
    contentStream,
    'endstream',
    'endobj',
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    'trailer<</Root 1 0 R/Size 6>>',
    '',
  ].join('\n');
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}

describe('extractDocumentText', () => {
  it('reads markdown as UTF-8 without altering it', async () => {
    const inputMarkdown = '# SOP Pendaftaran\n\nPasien **BPJS** mendaftar pukul 07.00.';

    const actualResult = await extractDocumentText({
      content: new Uint8Array(Buffer.from(inputMarkdown, 'utf8')),
      mimeType: 'text/markdown',
    });

    expect(actualResult.text).toBe(inputMarkdown);
    // Markdown has no page concept; reporting 1 would be an invented fact.
    expect(actualResult.pageCount).toBeNull();
  });

  it('preserves non-ASCII characters in plain text', async () => {
    const inputText = 'Pukul 07.00 — antrean dibuka. Ruang café lantai 2.';

    const actualResult = await extractDocumentText({
      content: new Uint8Array(Buffer.from(inputText, 'utf8')),
      mimeType: 'text/plain',
    });

    expect(actualResult.text).toBe(inputText);
  });

  it('extracts text from a PDF and reports its page count', async () => {
    const actualResult = await extractDocumentText({
      content: buildSinglePagePdf('SOP Pendaftaran BPJS'),
      mimeType: 'application/pdf',
    });

    expect(actualResult.text).toContain('SOP Pendaftaran BPJS');
    expect(actualResult.pageCount).toBe(1);
  });

  it('leaves no page-boundary marker in the extracted PDF text', async () => {
    const actualResult = await extractDocumentText({
      content: buildSinglePagePdf('Halaman satu'),
      mimeType: 'application/pdf',
    });

    // The parser's default joiner is "-- 1 of 1 --". Left in, it would be
    // embedded as document content and would match a question about page
    // numbers with a passage that answers nothing.
    expect(actualResult.text).not.toMatch(/--\s*\d+\s+of\s+\d+\s*--/);
  });

  it('refuses a format it has no branch for rather than returning empty text', async () => {
    // "Extracted nothing" and "cannot read this format" are different facts,
    // and only one of them is worth an operator's attention.
    await expect(
      extractDocumentText({ content: new Uint8Array([1, 2, 3]), mimeType: 'image/png' }),
    ).rejects.toThrow(/Cannot extract text from image\/png/);
  });

  it('rejects a file that is not a readable PDF', async () => {
    await expect(
      extractDocumentText({
        content: new Uint8Array(Buffer.from('not a pdf at all', 'utf8')),
        mimeType: 'application/pdf',
      }),
    ).rejects.toBeDefined();
  });
});
