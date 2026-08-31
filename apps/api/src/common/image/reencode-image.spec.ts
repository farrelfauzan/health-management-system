import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

import { reencodeImage } from './reencode-image';

const MAX_EDGE_PIXELS = 1024;

async function buildImage(
  widthPixels: number,
  heightPixels: number,
  format: 'png' | 'jpeg' | 'webp',
): Promise<Uint8Array> {
  const image = sharp({
    create: {
      width: widthPixels,
      height: heightPixels,
      channels: 4,
      background: { r: 15, g: 118, b: 110, alpha: 1 },
    },
  });
  const buffer = await (
    format === 'png' ? image.png() : format === 'jpeg' ? image.jpeg() : image.webp()
  ).toBuffer();
  return new Uint8Array(buffer);
}

describe('reencodeImage', () => {
  it.each(['png', 'jpeg', 'webp'] as const)('rewrites a %s upload as PNG', async (format) => {
    const inputContent = await buildImage(64, 64, format);

    const actual = await reencodeImage({ content: inputContent, maxEdgePixels: MAX_EDGE_PIXELS });

    // One stored type means one content type to pin on the signed download,
    // whatever the browser happened to hand us.
    const metadata = await sharp(Buffer.from(actual.content)).metadata();
    expect(metadata.format).toBe('png');
    expect(actual.widthPixels).toBe(64);
    expect(actual.heightPixels).toBe(64);
  });

  it('scales an oversized image down to the longest edge, preserving aspect ratio', async () => {
    const inputContent = await buildImage(2048, 512, 'png');

    const actual = await reencodeImage({ content: inputContent, maxEdgePixels: MAX_EDGE_PIXELS });

    expect(actual.widthPixels).toBe(1024);
    expect(actual.heightPixels).toBe(256);
  });

  it('leaves a small image at its own size rather than upscaling it', async () => {
    const inputContent = await buildImage(120, 40, 'png');

    const actual = await reencodeImage({ content: inputContent, maxEdgePixels: MAX_EDGE_PIXELS });

    expect(actual.widthPixels).toBe(120);
    expect(actual.heightPixels).toBe(40);
  });

  it('strips EXIF metadata from the stored bytes', async () => {
    // The reason the re-encode exists at all: a phone photo carries GPS
    // coordinates and a device serial, and an invoice logo is published.
    const inputContent = new Uint8Array(
      await sharp({
        create: { width: 32, height: 32, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .withExif({ IFD0: { Copyright: 'Klinik Sehat Bersama', Software: 'test-fixture' } })
        .jpeg()
        .toBuffer(),
    );
    expect((await sharp(Buffer.from(inputContent)).metadata()).exif).toBeDefined();

    const actual = await reencodeImage({ content: inputContent, maxEdgePixels: MAX_EDGE_PIXELS });

    expect((await sharp(Buffer.from(actual.content)).metadata()).exif).toBeUndefined();
  });

  it('preserves transparency so a logo does not gain a white box', async () => {
    const inputContent = new Uint8Array(
      await sharp({
        create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .png()
        .toBuffer(),
    );

    const actual = await reencodeImage({ content: inputContent, maxEdgePixels: MAX_EDGE_PIXELS });

    expect((await sharp(Buffer.from(actual.content)).metadata()).hasAlpha).toBe(true);
  });

  it('rejects bytes no decoder can read, without quoting the decoder', async () => {
    await expect(
      reencodeImage({ content: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), maxEdgePixels: 64 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      reencodeImage({ content: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), maxEdgePixels: 64 }),
    ).rejects.toThrow('Uploaded image could not be decoded');
  });
});
