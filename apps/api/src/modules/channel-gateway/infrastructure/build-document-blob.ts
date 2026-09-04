import { SendChannelDocumentRequest } from './channel-gateway.types';

/**
 * The request's bytes as a `Blob` carrying its MIME type, for a bridge that
 * takes the file as a multipart field (`P16-T22`).
 *
 * Copied into a fresh buffer rather than wrapped: a `Uint8Array` may be a
 * view onto a larger, shared buffer (a slice of a stream chunk, say), and a
 * Blob over the whole backing store would put bytes on the wire the caller
 * never meant to send.
 */
export function buildDocumentBlob(request: SendChannelDocumentRequest): Blob {
  const bytes = new Uint8Array(request.content.byteLength);
  bytes.set(request.content);
  return new Blob([bytes], { type: request.mimeType });
}
