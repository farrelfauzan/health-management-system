import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

import { ReencodeImageParams, ReencodeImageResult } from './image.types';

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
 * PNG output regardless of input: lossless for the flat colour a logo is made
 * of, alpha-preserving so a transparent mark does not gain a white box, and
 * one stored type means one content type to pin on the signed download.
 */
export async function reencodeImage(params: ReencodeImageParams): Promise<ReencodeImageResult> {
  try {
    const { data, info } = await sharp(Buffer.from(params.content), {
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: params.maxEdgePixels,
        height: params.maxEdgePixels,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
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
