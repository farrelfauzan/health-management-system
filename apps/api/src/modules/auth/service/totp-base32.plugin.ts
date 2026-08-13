import { createBase32Plugin } from '@otplib/core';
import type { Base32Plugin } from '@otplib/core';
import { decode, encode } from 'hi-base32';

/**
 * The base32 codec otplib uses to turn a TOTP secret into the string a user
 * scans or types (SJ-8).
 *
 * otplib's own base32 plugin is built on `@scure/base`, which publishes ESM
 * only. Node loads it from CommonJS without complaint, but jest's module
 * registry refuses to, so importing it puts every spec that touches
 * `AppModule` — including the route-guard coverage proof — behind a
 * transform hack. `hi-base32` is dependency-free CommonJS and is the codec
 * otplib itself shipped before v13, so this swaps an ESM/CJS argument for a
 * library the same authors relied on, and the shipped code becomes the code
 * the tests run.
 *
 * Padding is stripped on the way out. RFC 4648 allows trailing `=`, but no
 * authenticator app shows it and `otpauth://` URIs in the wild never carry
 * it; a padded secret is accepted on the way back in regardless, so a code
 * pasted from anywhere still works.
 */
export function createTotpBase32Plugin(): Base32Plugin {
  return createBase32Plugin({
    name: 'hi-base32',
    encode: (data: Uint8Array): string => encode(data).replace(/=+$/, ''),
    decode: (value: string): Uint8Array =>
      Uint8Array.from(decode.asBytes(value.replace(/=+$/, '').toUpperCase())),
  });
}
