import { createDecipheriv, createHash } from 'node:crypto';

import LZString from 'lz-string';

import { BpjsPcareCodecError } from './bpjs-pcare-codec.error';
import { BpjsPcareDecryptionContext, BpjsPcareResponseEnvelope } from './bpjs-pcare.types';

/**
 * Decodes a PCare REST v3.0 response body. Since v3.0 the `response` field of
 * the `{ metaData, response }` envelope arrives as an encrypted, compressed
 * string: AES-256-CBC (key = SHA-256 of `consId + secretKey + timestamp`
 * sent on the request, IV = first 16 bytes of that hash), then LZ-String
 * `decompressFromEncodedURIComponent`, then JSON. Error envelopes ship
 * `response` as plain JSON (or null) and pass through undecoded. Protocol
 * confirmed against the community reference implementations recorded in the
 * P11-T01 ADR (docs/post-mvp/decisions.md).
 */
export function decodeBpjsPcareResponse(params: {
  readonly context: BpjsPcareDecryptionContext;
  readonly rawBody: string;
}): BpjsPcareResponseEnvelope {
  const envelope: BpjsPcareResponseEnvelope = parseEnvelopeOrThrow(params.rawBody);
  if (typeof envelope.response !== 'string') {
    return envelope;
  }
  const plaintext: string = decryptResponseOrThrow(params.context, envelope.response);
  const decompressed: string = decompressResponseOrThrow(plaintext);
  return { metaData: envelope.metaData, response: parseDecryptedJsonOrThrow(decompressed) };
}

function parseEnvelopeOrThrow(rawBody: string): BpjsPcareResponseEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new BpjsPcareCodecError(
      'BPJS_PCARE_RESPONSE_MALFORMED',
      'Response body is not valid JSON.',
    );
  }
  if (typeof parsed !== 'object' || parsed === null || !('metaData' in parsed)) {
    throw new BpjsPcareCodecError(
      'BPJS_PCARE_RESPONSE_MALFORMED',
      'Response body is missing the metaData envelope.',
    );
  }
  return parsed as BpjsPcareResponseEnvelope;
}

function deriveResponseKeyMaterial(context: BpjsPcareDecryptionContext): {
  readonly key: Buffer;
  readonly iv: Buffer;
} {
  const hash: Buffer = createHash('sha256')
    .update(`${context.consId}${context.secretKey}${context.timestamp}`)
    .digest();
  return { key: hash, iv: hash.subarray(0, 16) };
}

function decryptResponseOrThrow(
  context: BpjsPcareDecryptionContext,
  ciphertextBase64: string,
): string {
  const { key, iv } = deriveResponseKeyMaterial(context);
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextBase64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new BpjsPcareCodecError(
      'BPJS_PCARE_DECRYPT_FAILED',
      'Response payload could not be decrypted with the derived key.',
    );
  }
}

function decompressResponseOrThrow(plaintext: string): string {
  let decompressed: string | null;
  try {
    decompressed = LZString.decompressFromEncodedURIComponent(plaintext);
  } catch {
    decompressed = null;
  }
  if (decompressed === null || decompressed === '') {
    throw new BpjsPcareCodecError(
      'BPJS_PCARE_DECOMPRESS_FAILED',
      'Decrypted payload is not valid LZ-String compressed data.',
    );
  }
  return decompressed;
}

function parseDecryptedJsonOrThrow(decompressed: string): unknown {
  try {
    return JSON.parse(decompressed);
  } catch {
    throw new BpjsPcareCodecError(
      'BPJS_PCARE_RESPONSE_MALFORMED',
      'Decrypted response payload is not valid JSON.',
    );
  }
}
