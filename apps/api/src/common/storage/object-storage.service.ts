import {
  DeleteObjectRequest,
  DeleteObjectResult,
  GenerateObjectKeyRequest,
  GetObjectRequest,
  GetObjectResult,
  GetSignedUrlRequest,
  GetSignedUrlResult,
  UploadObjectRequest,
  UploadObjectResult,
} from './storage.types';

/**
 * Provider-neutral object-storage contract injected by feature services.
 * Implementations own all provider SDK concerns; feature modules must depend
 * on this abstraction only and never import storage SDK clients directly.
 */
export abstract class ObjectStorageService {
  /**
   * Generates an opaque, server-owned object key. Caller-supplied keys are
   * rejected by design and keys must never contain PII.
   */
  abstract generateObjectKey(request: GenerateObjectKeyRequest): string;

  /**
   * Uploads an object to the private bucket after validating size and MIME type.
   */
  abstract uploadObject(request: UploadObjectRequest): Promise<UploadObjectResult>;

  /**
   * Retrieves object bytes for trusted backend streaming/use cases only.
   * Normal web display must use signed URLs instead of proxying bytes.
   */
  abstract getObject(request: GetObjectRequest): Promise<GetObjectResult>;

  /**
   * Returns a short-lived signed URL with expiry metadata. Signed URLs must
   * never be persisted.
   */
  abstract getSignedUrl(request: GetSignedUrlRequest): Promise<GetSignedUrlResult>;

  /**
   * Deletes an object idempotently. A missing object is treated as an
   * already-completed delete.
   */
  abstract deleteObject(request: DeleteObjectRequest): Promise<DeleteObjectResult>;
}
