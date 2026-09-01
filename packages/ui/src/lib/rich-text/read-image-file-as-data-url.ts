/**
 * The API sanitiser only lets `<img>` keep a `data:image/*` source (the PDF
 * renderer is network-denied), and template bodies are capped at 200,000
 * characters — so inline images must stay small. 100 KiB of file becomes
 * ~137 KiB of base64, leaving room for the rest of the document.
 */
const IMAGE_MAX_SIZE_BYTES = 100 * 1024;
const ACCEPTED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type ReadImageFileResult = { dataUrl: string; error?: never } | { dataUrl?: never; error: string };

export async function readImageFileAsDataUrl(file: File): Promise<ReadImageFileResult> {
  const isAcceptedType = (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
  if (!isAcceptedType) {
    return { error: 'Only PNG, JPEG and WebP images can be inserted' };
  }
  if (file.size > IMAGE_MAX_SIZE_BYTES) {
    return { error: 'Images must be 100 KB or smaller to fit inside the document' };
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      resolve(
        dataUrl.startsWith('data:image/')
          ? { dataUrl }
          : { error: 'The selected file could not be read as an image' },
      );
    };
    reader.onerror = () => resolve({ error: 'The selected file could not be read as an image' });
    reader.readAsDataURL(file);
  });
}
