import mammoth from 'mammoth';

import { ConvertedDocxTemplate, DocumentTemplateImportWarning } from '@hms/shared-types';

import { reencodeImage, validateImageContent } from '../../../common/image';
import { ReencodeImageFormat } from '../../../common/image/image.types';
import { convertPlaceholdersToTokens } from './convert-placeholders-to-tokens';

/**
 * Word's own heading styles map by default; the title style does not, and a
 * clinic's letterhead is usually the document title.
 */
const STYLE_MAP: readonly string[] = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => p:fresh",
];

/** A letterhead at 1600px on its longest edge prints crisply on A4; larger only costs bytes. */
const MAX_IMAGE_EDGE_PIXELS = 1600;

const REENCODE_FORMAT_BY_MIME_TYPE: Readonly<Record<string, ReencodeImageFormat>> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};

/** An `img` whose source is not an inline image — an image the converter dropped. */
const ORPHAN_IMAGE_PATTERN = /<img(?![^>]*\ssrc="data:image\/)[^>]*>/g;

/**
 * Word → editor HTML (`P16-T42`).
 *
 * mammoth reads the document's *semantics* — headings, emphasis, tables,
 * lists — and writes clean HTML for them, which is exactly the subset the
 * editor keeps. Every embedded image is validated on its bytes and
 * re-encoded through `common/image` before it becomes an inline `data:`
 * image, the same rule the clinic logo and the document store follow: the
 * stored bytes are never the uploaded bytes. Anything that is not PNG, JPEG
 * or WebP — EMF and WMF drawings, SVG — is dropped with a warning rather
 * than passed through.
 */
export async function convertDocxToTemplateHtml(
  content: Uint8Array,
): Promise<ConvertedDocxTemplate> {
  const warnings: DocumentTemplateImportWarning[] = [];
  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(content) },
    {
      styleMap: [...STYLE_MAP],
      convertImage: mammoth.images.imgElement(async (image) => {
        const source = await toInlineImageSource(image.contentType, await image.readAsBuffer());
        if (source === null) {
          warnings.push({
            code: 'IMAGE_DROPPED',
            message: `An image of type ${image.contentType} could not be carried over`,
            detail: image.contentType,
          });
          return { src: '' };
        }
        return { src: source };
      }),
    },
  );
  for (const message of result.messages) {
    warnings.push({ code: 'UNSUPPORTED_CONTENT', message: message.message });
  }
  const withoutOrphans = result.value.replace(ORPHAN_IMAGE_PATTERN, '');
  const converted = convertPlaceholdersToTokens(withoutOrphans);
  return { html: converted.html, warnings: [...warnings, ...converted.warnings] };
}

async function toInlineImageSource(
  contentType: string,
  content: Uint8Array,
): Promise<string | null> {
  const format = REENCODE_FORMAT_BY_MIME_TYPE[contentType];
  if (format === undefined) {
    return null;
  }
  const verdict = validateImageContent({ content, declaredMimeType: contentType });
  if (!verdict.isAccepted) {
    return null;
  }
  const reencoded = await reencodeImage({ content, format, maxEdgePixels: MAX_IMAGE_EDGE_PIXELS });
  return `data:${contentType};base64,${Buffer.from(reencoded.content).toString('base64')}`;
}
