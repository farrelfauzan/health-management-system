export type StorageConfig = {
  readonly region: string;
  readonly bucket: string;
  readonly endpoint?: string;
  readonly forcePathStyle: boolean;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly requestTimeoutMs: number;
  readonly signedUrlExpiresInSeconds: number;
  readonly maxUploadSizeBytes: number;
  readonly allowedMimeTypes: readonly string[];
};

export type GenerateObjectKeyRequest = {
  keyPrefix: string;
  fileExtension?: string;
};

export type UploadObjectRequest = {
  key: string;
  body: Buffer;
  contentType: string;
};

export type UploadObjectResult = {
  key: string;
  etag?: string;
};

export type GetObjectRequest = {
  key: string;
};

export type GetObjectResult = {
  key: string;
  body: Buffer;
  contentType?: string;
};

export type GetSignedUrlRequest = {
  key: string;
  expiresInSeconds?: number;
};

export type GetSignedUrlResult = {
  url: string;
  expiresAt: string;
};

/**
 * A browser-direct upload. `contentType` and `contentLengthBytes` are
 * declared up front because both are validated *before* signing and then
 * signed into the URL — the client cannot widen either afterwards.
 */
export type GetSignedUploadUrlRequest = {
  key: string;
  contentType: string;
  contentLengthBytes: number;
  expiresInSeconds?: number;
};

/**
 * `requiredHeaders` must be sent verbatim on the PUT. They are part of the
 * signature, so a request that omits or changes one is rejected by the
 * provider rather than silently stored under different metadata.
 */
export type GetSignedUploadUrlResult = {
  url: string;
  key: string;
  expiresAt: string;
  requiredHeaders: Readonly<Record<string, string>>;
};

export type HeadObjectRequest = {
  key: string;
};

export type HeadObjectResult = {
  key: string;
  sizeBytes: number;
  contentType?: string;
  etag?: string;
};

export type DeleteObjectRequest = {
  key: string;
};

export type DeleteObjectResult = {
  key: string;
  deleted: boolean;
};
