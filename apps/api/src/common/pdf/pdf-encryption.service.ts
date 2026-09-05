import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { PDFDocument } from '@cantoo/pdf-lib';

import { EncryptPdfRequest } from './pdf.types';

/**
 * Bytes of entropy behind the owner password. It is never shown to anyone —
 * it exists only so the user password is not also the owner password, which
 * would let whoever opens the file strip its protection.
 */
const OWNER_PASSWORD_BYTES = 32;

/**
 * AES-256 user-password encryption applied in the API, after render and
 * before the bytes leave the system (`P16-T37`, FR-E4-06, D-026 finding 1).
 *
 * The renderer emits PDF 1.4 and has no encryption route, so this cannot be
 * a form field on the sidecar: the library re-serialises the document under
 * `/V 5 /R 6` — the only scheme ISO 32000-2 still recommends — and raises the
 * header to 1.7 to match. The password is a *misdelivery* control, not a
 * cryptographic secret (D-027): a mistyped digit or address is the failure
 * this stops, and it says so rather than implying otherwise.
 *
 * The owner password is fresh randomness per call and is discarded. Nobody
 * holds it, so nobody can lift the restrictions — and the clinic keeps its
 * own unencrypted copy in the object store, which is the copy it would ever
 * re-issue from.
 */
@Injectable()
export class PdfEncryptionService {
  async encryptWithUserPassword(requestBody: EncryptPdfRequest): Promise<Uint8Array> {
    if (requestBody.userPassword.length === 0) {
      throw new Error('PDF encryption requires a non-empty user password');
    }
    const document = await PDFDocument.load(requestBody.pdf);
    document.encrypt({
      userPassword: requestBody.userPassword,
      ownerPassword: randomBytes(OWNER_PASSWORD_BYTES).toString('base64url'),
      algorithm: 'AES-256',
      permissions: {
        // The patient may print and read their own receipt or result; what
        // they may not do is silently alter it and pass it on as issued.
        printing: 'highResolution',
        copying: true,
        contentAccessibility: true,
        modifying: false,
        annotating: false,
        fillingForms: false,
        documentAssembly: false,
      },
    });
    return document.save({ useObjectStreams: false });
  }
}
