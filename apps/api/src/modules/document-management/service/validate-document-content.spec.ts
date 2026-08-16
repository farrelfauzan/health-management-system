import { validateDocumentContent } from './validate-document-content';

/**
 * Minimal but structurally real PDF bytes: header at offset zero, one page,
 * a trailer — enough that "is a PDF" is decided by the same bytes a reader
 * would accept, not by a bare header string.
 */
function buildPdfBytes(extraTrailerText = ''): Uint8Array {
  const pdfText = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj',
    `trailer << /Root 1 0 R ${extraTrailerText} >>`,
    '%%EOF',
  ].join('\n');
  return new Uint8Array(Buffer.from(pdfText, 'ascii'));
}

/** The DOS/PE header a renamed Windows executable starts with. */
function buildRenamedExecutableBytes(): Uint8Array {
  const header = Buffer.from('MZ', 'ascii');
  const stub = Buffer.alloc(62, 0);
  return new Uint8Array(Buffer.concat([header, stub]));
}

describe('validateDocumentContent', () => {
  describe('application/pdf', () => {
    it('accepts a file that begins with the PDF signature', () => {
      const actual = validateDocumentContent({
        content: buildPdfBytes(),
        declaredMimeType: 'application/pdf',
      });

      expect(actual).toEqual({ isAccepted: true });
    });

    it('rejects a renamed executable declared as a PDF', () => {
      const actual = validateDocumentContent({
        content: buildRenamedExecutableBytes(),
        declaredMimeType: 'application/pdf',
      });

      expect(actual).toEqual({
        isAccepted: false,
        reason: expect.stringContaining('PDF signature'),
      });
    });

    it('rejects a polyglot whose PDF header is buried mid-file', () => {
      const buried = Buffer.concat([
        Buffer.from('GIF89a', 'ascii'),
        Buffer.from(buildPdfBytes()),
      ]);

      const actual = validateDocumentContent({
        content: new Uint8Array(buried),
        declaredMimeType: 'application/pdf',
      });

      expect(actual).toEqual({
        isAccepted: false,
        reason: expect.stringContaining('PDF signature'),
      });
    });

    it('rejects an encrypted PDF because it cannot be inspected', () => {
      const actual = validateDocumentContent({
        content: buildPdfBytes('/Encrypt 3 0 R'),
        declaredMimeType: 'application/pdf',
      });

      expect(actual).toEqual({
        isAccepted: false,
        reason: expect.stringContaining('Encrypted'),
      });
    });

    it('rejects plain text declared as a PDF', () => {
      const actual = validateDocumentContent({
        content: new Uint8Array(Buffer.from('just notes', 'utf8')),
        declaredMimeType: 'application/pdf',
      });

      expect(actual.isAccepted).toBe(false);
    });
  });

  describe.each(['text/plain', 'text/markdown'] as const)('%s', (declaredMimeType) => {
    it('accepts UTF-8 text, including non-ASCII characters', () => {
      const actual = validateDocumentContent({
        content: new Uint8Array(Buffer.from('# Panduan Praktik — dr. Ayu\n', 'utf8')),
        declaredMimeType,
      });

      expect(actual).toEqual({ isAccepted: true });
    });

    it('rejects a renamed executable declared as text', () => {
      const actual = validateDocumentContent({
        content: buildRenamedExecutableBytes(),
        declaredMimeType,
      });

      expect(actual).toEqual({
        isAccepted: false,
        reason: expect.stringContaining('Windows executable'),
      });
    });

    it('rejects a ZIP archive declared as text', () => {
      const zipBytes = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.alloc(32, 1),
      ]);

      const actual = validateDocumentContent({
        content: new Uint8Array(zipBytes),
        declaredMimeType,
      });

      expect(actual).toEqual({
        isAccepted: false,
        reason: expect.stringContaining('ZIP archive'),
      });
    });

    it('rejects a PDF declared as text', () => {
      const actual = validateDocumentContent({
        content: buildPdfBytes(),
        declaredMimeType,
      });

      expect(actual).toEqual({
        isAccepted: false,
        reason: expect.stringContaining('PDF document'),
      });
    });

    it('rejects text carrying embedded NUL bytes', () => {
      const withNul = Buffer.concat([
        Buffer.from('looks like text', 'utf8'),
        Buffer.from([0x00]),
        Buffer.from('but is not', 'utf8'),
      ]);

      const actual = validateDocumentContent({
        content: new Uint8Array(withNul),
        declaredMimeType,
      });

      expect(actual).toEqual({
        isAccepted: false,
        reason: expect.stringContaining('binary data'),
      });
    });

    it('rejects bytes that are not valid UTF-8', () => {
      const invalidUtf8 = Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0xc3, 0x28]);

      const actual = validateDocumentContent({
        content: new Uint8Array(invalidUtf8),
        declaredMimeType,
      });

      expect(actual).toEqual({
        isAccepted: false,
        reason: expect.stringContaining('UTF-8'),
      });
    });
  });
});
