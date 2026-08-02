import {
  DeleteObjectRequest,
  DeleteObjectResult,
  GenerateObjectKeyRequest,
  GetObjectRequest,
  GetObjectResult,
  GetSignedUploadUrlRequest,
  GetSignedUploadUrlResult,
  GetSignedUrlRequest,
  GetSignedUrlResult,
  HeadObjectRequest,
  HeadObjectResult,
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
   * Returns a short-lived signed URL the client PUTs the file to directly,
   * so large uploads never proxy through the API.
   *
   * The declared content type and size are validated against the configured
   * limits **before** signing and are then signed into the URL, which is what
   * keeps `uploadObject`'s guarantees intact on a path where the server never
   * sees the bytes: a client that changes either header gets a rejection from
   * the provider, not a stored object. The upload is still unconfirmed
   * afterwards — call {@link headObject} before recording it.
   */
  abstract getSignedUploadUrl(
    request: GetSignedUploadUrlRequest,
  ): Promise<GetSignedUploadUrlResult>;

  /**
   * Reads an object's metadata without its bytes. This is the confirmation
   * step of a direct upload: "the client said it uploaded" is not evidence,
   * and a row must not be written against an object that is absent or larger
   * than what was authorized.
   */
  abstract headObject(request: HeadObjectRequest): Promise<HeadObjectResult>;

  /**
   * Deletes an object idempotently. A missing object is treated as an
   * already-completed delete.
   */
  abstract deleteObject(request: DeleteObjectRequest): Promise<DeleteObjectResult>;
}
