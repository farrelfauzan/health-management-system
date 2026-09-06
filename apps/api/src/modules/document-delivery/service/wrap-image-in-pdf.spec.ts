import { PDFDocument } from '@cantoo/pdf-lib';

import {
  isDeliverableClinicalMimeType,
  isPdfWrappableImageMimeType,
  wrapImageInPdf,
} from './wrap-image-in-pdf';

/** A 1×1 red PNG. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

describe('wrapImageInPdf', () => {
  it('produces a one-page PDF with the image drawn on it', async () => {
    const actual = await wrapImageInPdf({ image: ONE_PIXEL_PNG, mimeType: 'image/png' });

    const document = await PDFDocument.load(actual);
    expect(Buffer.from(actual.slice(0, 5)).toString('ascii')).toBe('%PDF-');
    expect(document.getPageCount()).toBe(1);
  });

  it('knows which stored types can leave as a locked PDF', () => {
    expect(isDeliverableClinicalMimeType('application/pdf')).toBe(true);
    expect(isDeliverableClinicalMimeType('image/jpeg')).toBe(true);
    expect(isDeliverableClinicalMimeType('image/png')).toBe(true);
    expect(isDeliverableClinicalMimeType('image/webp')).toBe(false);
    expect(isDeliverableClinicalMimeType('text/plain')).toBe(false);
    expect(isPdfWrappableImageMimeType('application/pdf')).toBe(false);
  });
});
