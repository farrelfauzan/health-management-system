import { randomUUID } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import { ObjectStorageService } from './object-storage.service';
import { resolveStorageConfig } from './storage.config';
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
  StorageConfig,
  UploadObjectRequest,
  UploadObjectResult,
} from './storage.types';

const OBJECT_KEY_PREFIX_PATTERN = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;
const FILE_EXTENSION_PATTERN = /^[a-z0-9]{1,10}$/;
const MILLISECONDS_PER_SECOND = 1_000;
/**
 * The shape {@link S3StorageService.generateObjectKey} produces. A presigned
 * upload hands a client direct write authority over exactly one key, so the
 * key must be one this service minted — never one that reached it from a
 * request body.
 */
const GENERATED_OBJECT_KEY_PATTERN =
  /^[a-z0-9]+(?:[/-][a-z0-9]+)*\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.[a-z0-9]{1,10})?$/;

/**
 * AWS S3-compatible implementation of the object-storage contract. Keeps all
 * AWS SDK usage inside the common storage layer and validates its typed
 * configuration at startup.
 */
@Injectable()
export class S3StorageService extends ObjectStorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly storageConfig: StorageConfig;
  private readonly s3Client: S3Client;
  private readonly uploadPresignClient: S3Client;

  constructor(configService: ConfigService) {
    super();
    this.storageConfig = resolveStorageConfig(configService);
    this.s3Client = this.createS3Client();
    // Presigning an upload needs its own client. With the SDK default
    // (`WHEN_SUPPORTED`) the flexible-checksums middleware computes a CRC32
    // over the request body and signs it into the URL — and while presigning
    // there is no body, so every upload URL would carry the checksum of zero
    // bytes and the provider would reject the real file. `WHEN_REQUIRED`
    // skips that auto-assignment. It is scoped to this client so the
    // byte-proxy `uploadObject` path keeps sending checksums exactly as
    // before.
    this.uploadPresignClient = this.createS3Client({
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }

  private createS3Client(overrides: Partial<S3ClientConfig> = {}): S3Client {
    return new S3Client({
      region: this.storageConfig.region,
      ...(this.storageConfig.endpoint ? { endpoint: this.storageConfig.endpoint } : {}),
      forcePathStyle: this.storageConfig.forcePathStyle,
      ...(this.storageConfig.accessKeyId && this.storageConfig.secretAccessKey
        ? {
            credentials: {
              accessKeyId: this.storageConfig.accessKeyId,
              secretAccessKey: this.storageConfig.secretAccessKey,
            },
          }
        : {}),
      requestHandler: new NodeHttpHandler({
        connectionTimeout: this.storageConfig.requestTimeoutMs,
        requestTimeout: this.storageConfig.requestTimeoutMs,
      }),
      ...overrides,
    });
  }

  /**
   * Generates an opaque object key (`<prefix>/<uuid>[.<extension>]`) without
   * any caller-controlled identifier or PII.
   */
  generateObjectKey(request: GenerateObjectKeyRequest): string {
    if (!OBJECT_KEY_PREFIX_PATTERN.test(request.keyPrefix)) {
      throw new Error('Object key prefix must contain lowercase segments of letters and digits');
    }
    if (request.fileExtension && !FILE_EXTENSION_PATTERN.test(request.fileExtension)) {
      throw new Error('File extension must contain up to 10 lowercase letters or digits');
    }
    const extensionSuffix = request.fileExtension ? `.${request.fileExtension}` : '';
    return `${request.keyPrefix}/${randomUUID()}${extensionSuffix}`;
  }

  /**
   * Validates file metadata against the configured limits and uploads the
   * object to the private bucket.
   */
  async uploadObject(request: UploadObjectRequest): Promise<UploadObjectResult> {
    const normalizedContentType = this.normalizeAllowedContentType(request.contentType);
    this.assertUploadSizeWithinLimits(request.body.byteLength);
    const response = await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.storageConfig.bucket,
        Key: request.key,
        Body: request.body,
        ContentType: normalizedContentType,
        ContentLength: request.body.byteLength,
      }),
    );
    this.logger.debug(`Uploaded object ${request.key} (requestId=${response.$metadata.requestId ?? 'unknown'})`);
    return {
      key: request.key,
      etag: response.ETag,
    };
  }

  /**
   * Streams object bytes for trusted backend use cases.
   */
  async getObject(request: GetObjectRequest): Promise<GetObjectResult> {
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.storageConfig.bucket,
          Key: request.key,
        }),
      );
      const bytes = (await response.Body?.transformToByteArray()) ?? new Uint8Array();
      return {
        key: request.key,
        body: Buffer.from(bytes),
        contentType: response.ContentType,
      };
    } catch (err) {
      if (this.isObjectMissingError(err)) {
        throw new NotFoundException('Stored object not found');
      }
      throw err;
    }
  }

  /**
   * Builds a short-lived signed URL and returns it with expiry metadata.
   */
  async getSignedUrl(request: GetSignedUrlRequest): Promise<GetSignedUrlResult> {
    const expiresInSeconds = this.resolveSignedUrlExpiry(request.expiresInSeconds);
    const expiresAt = this.buildExpiresAt(expiresInSeconds);
    const url = await getSignedUrl(
      this.s3Client,
      new GetObjectCommand({
        Bucket: this.storageConfig.bucket,
        Key: request.key,
        ...(request.responseContentDisposition
          ? { ResponseContentDisposition: request.responseContentDisposition }
          : {}),
        ...(request.responseContentType
          ? { ResponseContentType: request.responseContentType }
          : {}),
      }),
      { expiresIn: expiresInSeconds },
    );
    return {
      url,
      expiresAt,
    };
  }

  /**
   * Signs a direct-to-provider upload of one object.
   *
   * Everything `uploadObject` checks is checked here too, but it has to be
   * checked *before* signing and then bound into the signature, because the
   * server never sees the bytes: `content-type` is passed to the presigner as
   * a signable header (the SDK does not sign it by default, which would leave
   * the MIME allowlist advisory), and `ContentLength` is signed so the client
   * cannot upload a file larger than the one it declared.
   */
  async getSignedUploadUrl(
    request: GetSignedUploadUrlRequest,
  ): Promise<GetSignedUploadUrlResult> {
    if (!GENERATED_OBJECT_KEY_PATTERN.test(request.key)) {
      throw new BadRequestException('Upload key must be a server-generated object key');
    }
    const normalizedContentType = this.normalizeAllowedContentType(request.contentType);
    this.assertUploadSizeWithinLimits(request.contentLengthBytes);
    const expiresInSeconds = this.resolveSignedUrlExpiry(request.expiresInSeconds);
    const expiresAt = this.buildExpiresAt(expiresInSeconds);
    const url = await getSignedUrl(
      this.uploadPresignClient,
      new PutObjectCommand({
        Bucket: this.storageConfig.bucket,
        Key: request.key,
        ContentType: normalizedContentType,
        ContentLength: request.contentLengthBytes,
      }),
      { expiresIn: expiresInSeconds, signableHeaders: new Set(['content-type']) },
    );
    return {
      url,
      key: request.key,
      expiresAt,
      requiredHeaders: {
        'Content-Type': normalizedContentType,
        'Content-Length': String(request.contentLengthBytes),
      },
    };
  }

  /**
   * Reads object metadata, so a caller can confirm a direct upload actually
   * landed before it writes a row against the key.
   */
  async headObject(request: HeadObjectRequest): Promise<HeadObjectResult> {
    try {
      const response = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.storageConfig.bucket,
          Key: request.key,
        }),
      );
      return {
        key: request.key,
        sizeBytes: response.ContentLength ?? 0,
        contentType: response.ContentType,
        etag: response.ETag,
      };
    } catch (err) {
      if (this.isObjectMissingError(err)) {
        throw new NotFoundException('Stored object not found');
      }
      throw err;
    }
  }

  /**
   * Deletes an object idempotently; a missing object counts as an
   * already-completed delete.
   */
  async deleteObject(request: DeleteObjectRequest): Promise<DeleteObjectResult> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.storageConfig.bucket,
          Key: request.key,
        }),
      );
    } catch (err) {
      if (!this.isObjectMissingError(err)) {
        throw err;
      }
      this.logger.debug(`Delete skipped for missing object ${request.key}`);
    }
    return {
      key: request.key,
      deleted: true,
    };
  }

  private normalizeAllowedContentType(contentType: string): string {
    const normalizedContentType = contentType.trim().toLowerCase();
    if (!this.storageConfig.allowedMimeTypes.includes(normalizedContentType)) {
      throw new BadRequestException('File content type is not allowed');
    }
    return normalizedContentType;
  }

  private assertUploadSizeWithinLimits(sizeBytes: number): void {
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      throw new BadRequestException('File content must not be empty');
    }
    if (sizeBytes > this.storageConfig.maxUploadSizeBytes) {
      throw new BadRequestException('File exceeds the maximum allowed upload size');
    }
  }

  private resolveSignedUrlExpiry(requestedExpiresInSeconds?: number): number {
    const expiresInSeconds =
      requestedExpiresInSeconds ?? this.storageConfig.signedUrlExpiresInSeconds;
    if (
      !Number.isInteger(expiresInSeconds) ||
      expiresInSeconds <= 0 ||
      expiresInSeconds > this.storageConfig.signedUrlExpiresInSeconds
    ) {
      throw new BadRequestException(
        'Signed URL expiry must be a positive integer within the configured maximum',
      );
    }
    return expiresInSeconds;
  }

  private buildExpiresAt(expiresInSeconds: number): string {
    return new Date(Date.now() + expiresInSeconds * MILLISECONDS_PER_SECOND).toISOString();
  }

  private isObjectMissingError(err: unknown): boolean {
    if (!(err instanceof S3ServiceException)) {
      return false;
    }
    return (
      err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata.httpStatusCode === 404
    );
  }
}
