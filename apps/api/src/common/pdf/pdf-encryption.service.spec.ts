import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { PDFParse } from 'pdf-parse';

import { PdfEncryptionService } from './pdf-encryption.service';

const CORRECT_PASSWORD = '07031988';
const WRONG_PASSWORD = '08031988';
const DOCUMENT_TEXT = 'Kuitansi INV-0001 Klinik Sehat Bersama';

/**
 * A PDF 1.4 document, as the renderer would hand over — Chromium's Skia
 * backend writes that header, and the cipher must not depend on it.
 */
async function buildPlainPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage();
  page.drawText(DOCUMENT_TEXT, { x: 50, y: 700, size: 14, font });
  const bytes = await document.save({ useObjectStreams: false });
  return replaceHeader(bytes, '%PDF-1.4');
}

function replaceHeader(bytes: Uint8Array, header: string): Uint8Array {
  const copy = Uint8Array.from(bytes);
  copy.set(Buffer.from(header, 'ascii'), 0);
  return copy;
}

function readHeader(bytes: Uint8Array): string {
  return Buffer.from(bytes.subarray(0, 8)).toString('ascii');
}

async function readText(bytes: Uint8Array, password?: string): Promise<string> {
  const parser = new PDFParse({ data: Uint8Array.from(bytes), password });
  try {
    const parsed = await parser.getText({ pageJoiner: '' });
    return parsed.text;
  } finally {
    await parser.destroy();
  }
}

describe('PdfEncryptionService', () => {
  const service = new PdfEncryptionService();

  it('produces a document that opens with the password and still carries the text', async () => {
    const inputPdf = await buildPlainPdf();

    const actualBytes = await service.encryptWithUserPassword({
      pdf: inputPdf,
      userPassword: CORRECT_PASSWORD,
    });

    await expect(readText(actualBytes, CORRECT_PASSWORD)).resolves.toContain('Kuitansi INV-0001');
  });

  it('refuses to open without a password', async () => {
    const inputPdf = await buildPlainPdf();

    const actualBytes = await service.encryptWithUserPassword({
      pdf: inputPdf,
      userPassword: CORRECT_PASSWORD,
    });

    // The control the whole ticket rests on: the output actually demands it.
    await expect(readText(actualBytes)).rejects.toThrow();
  });

  it('refuses to open with the wrong password', async () => {
    const inputPdf = await buildPlainPdf();

    const actualBytes = await service.encryptWithUserPassword({
      pdf: inputPdf,
      userPassword: CORRECT_PASSWORD,
    });

    await expect(readText(actualBytes, WRONG_PASSWORD)).rejects.toThrow();
  });

  it('raises a 1.4 header to 1.7 so the AES-256 file is self-consistent', async () => {
    const inputPdf = await buildPlainPdf();
    expect(readHeader(inputPdf)).toBe('%PDF-1.4');

    const actualBytes = await service.encryptWithUserPassword({
      pdf: inputPdf,
      userPassword: CORRECT_PASSWORD,
    });

    expect(readHeader(actualBytes)).toBe('%PDF-1.7');
  });

  it('leaves no plaintext of the document in the output', async () => {
    const inputPdf = await buildPlainPdf();

    const actualBytes = await service.encryptWithUserPassword({
      pdf: inputPdf,
      userPassword: CORRECT_PASSWORD,
    });

    expect(Buffer.from(actualBytes).toString('latin1')).not.toContain('Kuitansi');
    expect(Buffer.from(actualBytes).toString('latin1')).not.toContain(CORRECT_PASSWORD);
  });

  it('refuses an empty password rather than producing an unlocked file', async () => {
    const inputPdf = await buildPlainPdf();

    await expect(
      service.encryptWithUserPassword({ pdf: inputPdf, userPassword: '' }),
    ).rejects.toThrow(/non-empty user password/);
  });
});
