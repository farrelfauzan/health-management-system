import { PDFParse } from 'pdf-parse';

import { ExtractDocumentTextParams, ExtractDocumentTextResult } from '@hms/shared-types';

/**
 * pdf-parse marks page boundaries with `-- 1 of 12 --` by default. That text
 * would be embedded as if it were part of the document and would match a
 * question about page numbers, so the joiner is emptied rather than stripped
 * afterwards with a regex that could also eat real content.
 */
const PDF_PARSE_PARAMETERS = { pageJoiner: '' } as const;

/**
 * Pulls plain text out of a stored file.
 *
 * The accepted types are the three the document store admits at upload, so
 * this cannot be reached with a format it has no branch for — but the default
 * still throws rather than returning an empty string, because "extracted
 * nothing" and "cannot read this format" are different facts and only one of
 * them is worth an operator's attention.
 */
export async function extractDocumentText(
  params: ExtractDocumentTextParams,
): Promise<ExtractDocumentTextResult> {
  if (params.mimeType === 'application/pdf') {
    return extractPdfText(params.content);
  }
  if (params.mimeType === 'text/markdown' || params.mimeType === 'text/plain') {
    return { text: Buffer.from(params.content).toString('utf8'), pageCount: null };
  }
  throw new Error(`Cannot extract text from ${params.mimeType}`);
}

async function extractPdfText(content: Uint8Array): Promise<ExtractDocumentTextResult> {
  const parser = new PDFParse({ data: content });
  try {
    const parsed = await parser.getText(PDF_PARSE_PARAMETERS);
    return { text: parsed.text, pageCount: parsed.total ?? null };
  } finally {
    // The parser holds a worker and typed-array buffers. Ingestion runs in a
    // loop over a batch, so leaking one per document is how a long-lived API
    // process grows until it is restarted.
    await parser.destroy();
  }
}
