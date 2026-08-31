import { validateImageContent } from './validate-image-content';

function buildBytes(...parts: Array<Buffer | number[]>): Uint8Array {
  return new Uint8Array(
    Buffer.concat(parts.map((part) => (Array.isArray(part) ? Buffer.from(part) : part))),
  );
}

const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PADDING = Buffer.alloc(32, 0x41);

describe('validateImageContent', () => {
  it.each([
    ['image/jpeg', buildBytes(JPEG_HEADER, PADDING)],
    ['image/png', buildBytes(PNG_HEADER, PADDING)],
    [
      'image/webp',
      buildBytes(
        Buffer.from('RIFF', 'ascii'),
        [0x20, 0, 0, 0],
        Buffer.from('WEBP', 'ascii'),
        PADDING,
      ),
    ],
  ])('accepts %s bytes carrying their own signature', (declaredMimeType, content) => {
    expect(validateImageContent({ content, declaredMimeType })).toEqual({ isAccepted: true });
  });

  it('rejects bytes whose signature belongs to another image type', () => {
    const actual = validateImageContent({
      content: buildBytes(PNG_HEADER, PADDING),
      declaredMimeType: 'image/jpeg',
    });

    expect(actual).toEqual({
      isAccepted: false,
      reason: 'Uploaded file does not start with a JPEG signature',
    });
  });

  it('rejects a renamed executable declared as an image', () => {
    const actual = validateImageContent({
      content: buildBytes(Buffer.from('MZ', 'ascii'), PADDING),
      declaredMimeType: 'image/png',
    });

    expect(actual.isAccepted).toBe(false);
  });

  it('rejects a polyglot that buries the signature after a prologue', () => {
    // The first thing a decoder sees must be the thing that was declared.
    const actual = validateImageContent({
      content: buildBytes(Buffer.from('GIF89a', 'ascii'), PNG_HEADER),
      declaredMimeType: 'image/png',
    });

    expect(actual.isAccepted).toBe(false);
  });

  it('rejects a RIFF container that is not WebP', () => {
    // `RIFF` alone is also a WAV file; the form type at offset 8 is what
    // separates them.
    const actual = validateImageContent({
      content: buildBytes(
        Buffer.from('RIFF', 'ascii'),
        [0x20, 0, 0, 0],
        Buffer.from('WAVE', 'ascii'),
        PADDING,
      ),
      declaredMimeType: 'image/webp',
    });

    expect(actual.isAccepted).toBe(false);
  });

  it('rejects a truncated WebP header rather than reading past the buffer', () => {
    const actual = validateImageContent({
      content: buildBytes(Buffer.from('RIFF', 'ascii')),
      declaredMimeType: 'image/webp',
    });

    expect(actual.isAccepted).toBe(false);
  });

  it('rejects an empty upload', () => {
    const actual = validateImageContent({
      content: new Uint8Array(0),
      declaredMimeType: 'image/png',
    });

    expect(actual).toEqual({ isAccepted: false, reason: 'Uploaded file is empty' });
  });

  it('rejects a type outside the surface allowlist, even a real image format', () => {
    // SVG is the one that matters: a document format with script and
    // external-reference semantics, wearing an `image/` prefix.
    const actual = validateImageContent({
      content: buildBytes(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', 'ascii')),
      declaredMimeType: 'image/svg+xml',
    });

    expect(actual).toEqual({
      isAccepted: false,
      reason: 'Uploaded file declares an unsupported image type (image/svg+xml)',
    });
  });
});
