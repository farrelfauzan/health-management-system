import { PDFDocument } from '@cantoo/pdf-lib';

/** The two raster types pdf-lib can embed; a WebP scan is refused at request time. */
export const PDF_WRAPPABLE_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

export type PdfWrappableImageMimeType = (typeof PDF_WRAPPABLE_IMAGE_MIME_TYPES)[number];

const PDF_MIME_TYPE = 'application/pdf';

/** A4 in PDF points, the page a scanned result is laid out on. */
const A4_WIDTH_POINTS = 595.28;
const A4_HEIGHT_POINTS = 841.89;
const PAGE_MARGIN_POINTS = 36;

export function isPdfWrappableImageMimeType(
  mimeType: string,
): mimeType is PdfWrappableImageMimeType {
  return PDF_WRAPPABLE_IMAGE_MIME_TYPES.some((candidate) => candidate === mimeType);
}

/** Whether a stored clinical file can leave as a locked PDF at all (`P16-T40`). */
export function isDeliverableClinicalMimeType(mimeType: string): boolean {
  return mimeType === PDF_MIME_TYPE || isPdfWrappableImageMimeType(mimeType);
}

/**
 * Wraps one photographed or scanned page into a single-page PDF so it can
 * be locked like any other delivered document (`P16-T40`, D-027). The
 * password protection is the whole reason a clinical file may leave the
 * building, and it exists only for PDFs — so an image becomes one first.
 * The image is scaled to fit an A4 page with a margin and is otherwise
 * untouched; the stored object is not modified.
 */
export async function wrapImageInPdf(params: {
  image: Uint8Array;
  mimeType: PdfWrappableImageMimeType;
}): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const embedded =
    params.mimeType === 'image/png'
      ? await document.embedPng(params.image)
      : await document.embedJpg(params.image);
  const page = document.addPage([A4_WIDTH_POINTS, A4_HEIGHT_POINTS]);
  const maxWidth = A4_WIDTH_POINTS - PAGE_MARGIN_POINTS * 2;
  const maxHeight = A4_HEIGHT_POINTS - PAGE_MARGIN_POINTS * 2;
  const scale = Math.min(maxWidth / embedded.width, maxHeight / embedded.height, 1);
  const width = embedded.width * scale;
  const height = embedded.height * scale;
  page.drawImage(embedded, {
    x: (A4_WIDTH_POINTS - width) / 2,
    y: (A4_HEIGHT_POINTS - height) / 2,
    width,
    height,
  });
  return document.save({ useObjectStreams: false });
}
