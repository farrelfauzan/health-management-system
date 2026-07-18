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

export type DeleteObjectRequest = {
  key: string;
};

export type DeleteObjectResult = {
  key: string;
  deleted: boolean;
};
