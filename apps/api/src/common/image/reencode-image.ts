import { BadRequestException } from '@nestjs/common';
import sharp, { Sharp } from 'sharp';

import { ReencodeImageFormat, ReencodeImageParams, ReencodeImageResult } from './image.types';

/**
 * Ceiling on the decoded pixel count, independent of the file size cap.
 *
 * The two bound different things. A size cap bounds the bytes that arrive; a
 * 40 KB PNG can still decode to hundreds of megapixels, which is a
 * decompression bomb aimed at the process doing the decoding. 50 MP is more
 * than any logo needs and small enough that the worst case is a rejected
 * upload rather than a memory spike in the API.
 */
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * Decodes an image and writes it back out from scratch (SJ-21,
 * `docs/security/file-uploads.md` §1).
 *
 * This is the control, not a convenience. Re-encoding does three things at
 * once that no inspection can do:
 *
 *   * **Strips metadata.** EXIF from a phone photo carries GPS coordinates
 *     and a device serial — PHI-adjacent data nobody meant to publish on an
 *     invoice. sharp keeps no metadata unless asked, so the output has none.
 *   * **Destroys polyglots.** A file that is a valid image *and* a valid
 *     archive or script survives a signature check; it does not survive being
 *     decoded to a pixel buffer and re-serialised, because only the pixels
 *     make the trip.
 *   * **Bounds the output.** The stored image is what the invoice embeds as a
 *     `data:` URI, so its dimensions are a rendering cost, not just a storage
 *     one.
 *
 * `rotate()` with no argument applies the EXIF orientation *before* the
 * metadata is dropped — without it, a photo taken sideways would be stored
 * sideways once the tag that explained it is gone.
 *
 * The output format and any resize are the caller's decision, because the two
 * surfaces want opposite things: a logo becomes a bounded PNG, a scanned
 * document keeps its own format at its own resolution. What neither can opt
 * out of is the decode-and-rewrite itself.
 */
export async function reencodeImage(params: ReencodeImageParams): Promise<ReencodeImageResult> {
  try {
    const { data, info } = await applyOutputFormat(
      applyResize(
        sharp(Buffer.from(params.content), { limitInputPixels: MAX_INPUT_PIXELS }).rotate(),
        params.maxEdgePixels,
      ),
      params.format,
    ).toBuffer({ resolveWithObject: true });
    return {
      content: new Uint8Array(data),
      widthPixels: info.width,
      heightPixels: info.height,
    };
  } catch {
    // The decoder's own message is not surfaced: it quotes offsets and
    // internal state from a file the caller supplied, which is detail an
    // attacker can read back but a clinic administrator cannot act on.
    throw new BadRequestException('Uploaded image could not be decoded');
  }
}

function applyResize(pipeline: Sharp, maxEdgePixels?: number): Sharp {
  if (maxEdgePixels === undefined) {
    return pipeline;
  }
  return pipeline.resize({
    width: maxEdgePixels,
    height: maxEdgePixels,
    fit: 'inside',
    withoutEnlargement: true,
  });
}

function applyOutputFormat(pipeline: Sharp, format: ReencodeImageFormat): Sharp {
  if (format === 'jpeg') {
    // Chroma subsampling left at sharp's default and quality high: a scan of
    // small print is exactly the content JPEG artefacts destroy, and the file
    // is already bounded by the surface's own size cap.
    return pipeline.jpeg({ quality: 90 });
  }
  if (format === 'webp') {
    return pipeline.webp({ quality: 90 });
  }
  return pipeline.png({ compressionLevel: 9 });
}
