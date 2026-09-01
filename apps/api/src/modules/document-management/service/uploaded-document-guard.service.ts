import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import {
  DocumentImageMimeTypeValue,
  GuardUploadedDocumentParams,
  GuardedDocumentUploadResult,
  isDocumentImageMimeType,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { ReencodeImageFormat } from '../../../common/image/image.types';
import { reencodeImage } from '../../../common/image/reencode-image';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { validateDocumentContent } from './validate-document-content';

/**
 * What each accepted image type is written back out as. Same format in, same
 * format out — unlike the clinic logo, which normalises everything to PNG.
 *
 * The difference is the content. A logo is flat colour a few hundred pixels
 * wide, so PNG costs nothing and buys alpha; a document is a photographed or
 * scanned page, and re-encoding a 15 MiB JPEG as PNG would multiply its size
 * against a surface whose whole problem is that scans are large.
 */
const REENCODE_FORMAT_BY_MIME_TYPE: Readonly<
  Record<DocumentImageMimeTypeValue, ReencodeImageFormat>
> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * The confirm-time content gate (SJ-21, `docs/security/file-uploads.md`).
 *
 * Uploads are browser-direct presigned PUTs, so the API never sees the bytes
 * on the way in — the declared MIME type is signed into the URL, but nothing
 * about the *content* is. This service is where the bytes are finally read
 * and asked to agree with that declaration, between "the object exists" and
 * "a row now points at it".
 *
 * For an image it does one thing more, and that thing is the reason images
 * can be accepted at all (`P16-T03`): the bytes are **decoded and written
 * back out**, and the re-encode replaces the stored object. What survives is
 * a pixel buffer this process serialised, so EXIF and GPS from a phone photo
 * are gone and a file that was both a valid image and a valid archive is now
 * only an image. The row records the re-encoded size, because that is what is
 * in the bucket.
 *
 * A rejected object is deleted before the request fails: leaving it in the
 * bucket would keep a file no row will ever reference, and a retried confirm
 * against it must keep failing rather than eventually being believed. The
 * rejection is audit-logged as `DOCUMENT_UPLOAD_REJECTED` with the reason and
 * the declared type, because a user repeatedly uploading executables under a
 * PDF declaration is a fact an investigator should be able to count.
 */
@Injectable()
export class UploadedDocumentGuardService {
  private readonly logger = new Logger(UploadedDocumentGuardService.name);

  constructor(
    private readonly objectStorageService: ObjectStorageService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Reads the uploaded object, rejects bytes that disagree with the declared
   * MIME type, and — for images — replaces the stored object with a
   * re-encode. Returns the size of whatever is in the bucket afterwards.
   */
  async guardUploadedDocument(
    params: GuardUploadedDocumentParams,
  ): Promise<GuardedDocumentUploadResult> {
    const storedObject = await this.objectStorageService.getObject({ key: params.storageKey });
    const verdict = validateDocumentContent({
      content: storedObject.body,
      declaredMimeType: params.declaredMimeType,
    });
    if (!verdict.isAccepted) {
      await this.rejectUpload(params, verdict.reason);
    }
    if (!isDocumentImageMimeType(params.declaredMimeType)) {
      return { sizeBytes: storedObject.body.byteLength };
    }
    return this.replaceWithReencodedImage(params, storedObject.body, params.declaredMimeType);
  }

  /**
   * Rewrites the stored object as this process's own re-encode.
   *
   * No resize: the point of a 300 dpi scan is that the small print is
   * readable, and a thumbnail of a radiology report is not a radiology
   * report. The size cap is what bounds the file; the re-encode is what makes
   * its contents inert.
   *
   * A decode failure is a rejection like any other, so the object is deleted
   * and audited on the way out rather than left behind.
   */
  private async replaceWithReencodedImage(
    params: GuardUploadedDocumentParams,
    content: Uint8Array,
    mimeType: DocumentImageMimeTypeValue,
  ): Promise<GuardedDocumentUploadResult> {
    const reencodedContent = await this.reencodeOrReject(params, content, mimeType);
    await this.objectStorageService.uploadObject({
      key: params.storageKey,
      body: Buffer.from(reencodedContent),
      contentType: mimeType,
    });
    return { sizeBytes: reencodedContent.byteLength };
  }

  private async reencodeOrReject(
    params: GuardUploadedDocumentParams,
    content: Uint8Array,
    mimeType: DocumentImageMimeTypeValue,
  ): Promise<Uint8Array> {
    try {
      const reencoded = await reencodeImage({
        content,
        format: REENCODE_FORMAT_BY_MIME_TYPE[mimeType],
      });
      return reencoded.content;
    } catch {
      return this.rejectUpload(params, 'Uploaded image could not be decoded');
    }
  }

  private async rejectUpload(params: GuardUploadedDocumentParams, reason: string): Promise<never> {
    await this.objectStorageService.deleteObject({ key: params.storageKey });
    await this.auditService.record({
      action: 'DOCUMENT_UPLOAD_REJECTED',
      resource: 'document',
      actorUserId: params.actorUserId,
      metadata: {
        storageKey: params.storageKey,
        declaredMimeType: params.declaredMimeType,
        reason,
      },
    });
    this.logger.warn(`Rejected uploaded object ${params.storageKey}: ${reason}`);
    throw new BadRequestException(reason);
  }
}
