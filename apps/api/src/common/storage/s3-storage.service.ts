import { randomUUID } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
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
  GetSignedUrlRequest,
  GetSignedUrlResult,
  StorageConfig,
  UploadObjectRequest,
  UploadObjectResult,
} from './storage.types';

const OBJECT_KEY_PREFIX_PATTERN = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;
const FILE_EXTENSION_PATTERN = /^[a-z0-9]{1,10}$/;
const MILLISECONDS_PER_SECOND = 1_000;

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

  constructor(configService: ConfigService) {
    super();
    this.storageConfig = resolveStorageConfig(configService);
    this.s3Client = new S3Client({
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
    const normalizedContentType = request.contentType.trim().toLowerCase();
    if (!this.storageConfig.allowedMimeTypes.includes(normalizedContentType)) {
      throw new BadRequestException('File content type is not allowed');
    }
    if (request.body.byteLength === 0) {
      throw new BadRequestException('File content must not be empty');
    }
    if (request.body.byteLength > this.storageConfig.maxUploadSizeBytes) {
      throw new BadRequestException('File exceeds the maximum allowed upload size');
    }
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
    const expiresInSeconds =
      request.expiresInSeconds ?? this.storageConfig.signedUrlExpiresInSeconds;
    if (
      !Number.isInteger(expiresInSeconds) ||
      expiresInSeconds <= 0 ||
      expiresInSeconds > this.storageConfig.signedUrlExpiresInSeconds
    ) {
      throw new BadRequestException(
        'Signed URL expiry must be a positive integer within the configured maximum',
      );
    }
    const expiresAt = new Date(
      Date.now() + expiresInSeconds * MILLISECONDS_PER_SECOND,
    ).toISOString();
    const url = await getSignedUrl(
      this.s3Client,
      new GetObjectCommand({
        Bucket: this.storageConfig.bucket,
        Key: request.key,
      }),
      { expiresIn: expiresInSeconds },
    );
    return {
      url,
      expiresAt,
    };
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

  private isObjectMissingError(err: unknown): boolean {
    if (!(err instanceof S3ServiceException)) {
      return false;
    }
    return (
      err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata.httpStatusCode === 404
    );
  }
}
