import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { AssertUploadedDocumentContentParams } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { validateDocumentContent } from './validate-document-content';

/**
 * The confirm-time content gate (SJ-21).
 *
 * Uploads are browser-direct presigned PUTs, so the API never sees the bytes
 * on the way in — the declared MIME type is signed into the URL, but nothing
 * about the *content* is. This service is where the bytes are finally read
 * and asked to agree with that declaration, between "the object exists" and
 * "a row now points at it".
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
   * Reads the uploaded object and rejects the confirm when its bytes disagree
   * with the declared MIME type. Returns nothing on success — the caller
   * already holds the object's metadata from its own `headObject` call.
   */
  async assertUploadedContentMatches(params: AssertUploadedDocumentContentParams): Promise<void> {
    const storedObject = await this.objectStorageService.getObject({ key: params.storageKey });
    const verdict = validateDocumentContent({
      content: storedObject.body,
      declaredMimeType: params.declaredMimeType,
    });
    if (verdict.isAccepted) {
      return;
    }
    await this.objectStorageService.deleteObject({ key: params.storageKey });
    await this.auditService.record({
      action: 'DOCUMENT_UPLOAD_REJECTED',
      resource: 'document',
      actorUserId: params.actorUserId,
      metadata: {
        storageKey: params.storageKey,
        declaredMimeType: params.declaredMimeType,
        reason: verdict.reason,
      },
    });
    this.logger.warn(
      `Rejected uploaded object ${params.storageKey}: ${verdict.reason}`,
    );
    throw new BadRequestException(verdict.reason);
  }
}
