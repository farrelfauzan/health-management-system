import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const mockSend = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockS3ClientConfigs: Array<Record<string, unknown>> = [];

jest.mock('@aws-sdk/client-s3', () => {
  class MockS3ServiceException extends Error {
    $metadata: { httpStatusCode?: number } = {};
  }

  class MockCommand {
    constructor(readonly input: Record<string, unknown>) {}
  }

  return {
    S3Client: class MockS3Client {
      send = mockSend;

      constructor(readonly config: Record<string, unknown>) {
        mockS3ClientConfigs.push(config);
      }
    },
    S3ServiceException: MockS3ServiceException,
    PutObjectCommand: class MockPutObjectCommand extends MockCommand {},
    GetObjectCommand: class MockGetObjectCommand extends MockCommand {},
    HeadObjectCommand: class MockHeadObjectCommand extends MockCommand {},
    DeleteObjectCommand: class MockDeleteObjectCommand extends MockCommand {},
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

jest.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: class MockNodeHttpHandler {
    constructor(readonly options: Record<string, unknown>) {}
  },
}));

import { S3ServiceException } from '@aws-sdk/client-s3';

import { S3StorageService } from './s3-storage.service';

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    S3_REGION: 'ap-southeast-1',
    S3_BUCKET: 'hms-test-bucket',
    ...overrides,
  };

  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('S3StorageService', () => {
  const VALID_OBJECT_KEY = 'documents/clinic/11111111-1111-4111-8111-111111111111.pdf';

  beforeEach(() => {
    jest.clearAllMocks();
    mockS3ClientConfigs.length = 0;
  });

  it('throws on invalid signed URL expiry configuration', () => {
    expect(
      () => new S3StorageService(buildConfigService({ S3_SIGNED_URL_EXPIRES_IN_SECONDS: '-5' })),
    ).toThrow('S3_SIGNED_URL_EXPIRES_IN_SECONDS must be a positive integer');
  });

  it('throws when signed URL expiry exceeds the allowed maximum', () => {
    expect(
      () =>
        new S3StorageService(buildConfigService({ S3_SIGNED_URL_EXPIRES_IN_SECONDS: '86400' })),
    ).toThrow('must not exceed');
  });

  it('throws when only one static credential value is provided', () => {
    expect(
      () => new S3StorageService(buildConfigService({ S3_ACCESS_KEY_ID: 'only-key-id' })),
    ).toThrow('must be set together');
  });

  it('throws on invalid allowed MIME type configuration', () => {
    expect(
      () => new S3StorageService(buildConfigService({ S3_ALLOWED_MIME_TYPES: 'not a mime' })),
    ).toThrow('contains invalid value');
  });

  it('generates opaque object keys under the requested prefix', () => {
    const service = new S3StorageService(buildConfigService());

    const key = service.generateObjectKey({ keyPrefix: 'patients/photos', fileExtension: 'png' });

    expect(key).toMatch(
      /^patients\/photos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
    );
  });

  it('rejects object key prefixes with unsupported characters', () => {
    const service = new S3StorageService(buildConfigService());

    expect(() => service.generateObjectKey({ keyPrefix: '../escape' })).toThrow(
      'Object key prefix',
    );
  });

  it('rejects uploads with a content type outside the allowlist', async () => {
    const service = new S3StorageService(buildConfigService());

    await expect(
      service.uploadObject({
        key: 'patients/photos/object-key',
        body: Buffer.from('content'),
        contentType: 'application/zip',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects uploads above the configured size limit', async () => {
    const service = new S3StorageService(
      buildConfigService({ S3_MAX_UPLOAD_SIZE_BYTES: '4' }),
    );

    await expect(
      service.uploadObject({
        key: 'patients/photos/object-key',
        body: Buffer.from('too large'),
        contentType: 'image/png',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('uploads a valid object to the configured bucket', async () => {
    mockSend.mockResolvedValue({
      ETag: '"etag-value"',
      $metadata: { requestId: 'req-1' },
    });
    const service = new S3StorageService(buildConfigService());

    const result = await service.uploadObject({
      key: 'patients/photos/object-key',
      body: Buffer.from('content'),
      contentType: 'IMAGE/PNG',
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].input).toEqual(
      expect.objectContaining({
        Bucket: 'hms-test-bucket',
        Key: 'patients/photos/object-key',
        ContentType: 'image/png',
      }),
    );
    expect(result).toEqual({ key: 'patients/photos/object-key', etag: '"etag-value"' });
  });

  it('returns signed URLs with expiry metadata', async () => {
    mockGetSignedUrl.mockResolvedValue('https://signed.example/object-key');
    const service = new S3StorageService(
      buildConfigService({ S3_SIGNED_URL_EXPIRES_IN_SECONDS: '120' }),
    );
    const beforeSigning = Date.now();

    const result = await service.getSignedUrl({ key: 'patients/photos/object-key' });

    expect(mockGetSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      expiresIn: 120,
    });
    expect(result.url).toBe('https://signed.example/object-key');
    const expiresAtMs = new Date(result.expiresAt).getTime();
    expect(expiresAtMs).toBeGreaterThanOrEqual(beforeSigning + 119_000);
    expect(expiresAtMs).toBeLessThanOrEqual(Date.now() + 121_000);
  });

  it('rejects signed URL requests above the configured expiry', async () => {
    const service = new S3StorageService(
      buildConfigService({ S3_SIGNED_URL_EXPIRES_IN_SECONDS: '120' }),
    );

    await expect(
      service.getSignedUrl({ key: 'patients/photos/object-key', expiresInSeconds: 600 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('signs an upload URL with the content type and length bound into it', async () => {
    // Both are signed on purpose: the server never sees these bytes, so the
    // MIME allowlist and the size limit only survive if the provider
    // enforces them. content-type is not signed by the SDK unless asked.
    mockGetSignedUrl.mockResolvedValue('https://signed.example/upload');
    const service = new S3StorageService(
      buildConfigService({ S3_SIGNED_URL_EXPIRES_IN_SECONDS: '120' }),
    );

    const result = await service.getSignedUploadUrl({
      key: VALID_OBJECT_KEY,
      contentType: 'APPLICATION/PDF',
      contentLengthBytes: 2048,
    });

    const [, command, options] = mockGetSignedUrl.mock.calls[0];
    expect(command.input).toEqual(
      expect.objectContaining({
        Bucket: 'hms-test-bucket',
        Key: VALID_OBJECT_KEY,
        ContentType: 'application/pdf',
        ContentLength: 2048,
      }),
    );
    expect(options.expiresIn).toBe(120);
    expect([...options.signableHeaders]).toEqual(['content-type']);
    expect(result).toEqual({
      url: 'https://signed.example/upload',
      key: VALID_OBJECT_KEY,
      expiresAt: expect.any(String),
      requiredHeaders: { 'Content-Type': 'application/pdf', 'Content-Length': '2048' },
    });
  });

  it('presigns uploads with a client that does not auto-assign a checksum', async () => {
    // Regression guard for a silent breakage: with the SDK default the
    // flexible-checksums middleware signs a CRC32 of the (absent) presign
    // body into the URL, and every real upload is then rejected for a
    // checksum mismatch. The byte-proxy client must keep the default.
    new S3StorageService(buildConfigService());

    expect(mockS3ClientConfigs).toHaveLength(2);
    expect(mockS3ClientConfigs[0]?.requestChecksumCalculation).toBeUndefined();
    expect(mockS3ClientConfigs[1]?.requestChecksumCalculation).toBe('WHEN_REQUIRED');
  });

  it('targets real AWS S3 when no endpoint is configured', () => {
    // Production runs against AWS, dev against MinIO, and one adapter serves
    // both. AWS mode is the *absence* of three settings, which is exactly the
    // kind of default that breaks silently: an endpoint left in place sends
    // production traffic to a dev host, `forcePathStyle` on gets a bucket
    // AWS no longer path-addresses, and hardcoded credentials defeat the
    // instance role. Pin all three.
    new S3StorageService(buildConfigService());

    expect(mockS3ClientConfigs[0]).not.toHaveProperty('endpoint');
    expect(mockS3ClientConfigs[0]?.forcePathStyle).toBe(false);
    expect(mockS3ClientConfigs[0]?.region).toBe('ap-southeast-1');
    // Omitted, not empty: this is what hands credential resolution to the
    // default provider chain (IAM instance/task role) rather than to nothing.
    expect(mockS3ClientConfigs[0]).not.toHaveProperty('credentials');
  });

  it('targets an S3-compatible endpoint with path-style addressing when configured', () => {
    new S3StorageService(
      buildConfigService({
        S3_ENDPOINT: 'http://127.0.0.1:9000',
        S3_FORCE_PATH_STYLE: 'true',
        S3_ACCESS_KEY_ID: 'devaccess',
        S3_SECRET_ACCESS_KEY: 'devsecret',
      }),
    );

    expect(mockS3ClientConfigs[0]?.endpoint).toBe('http://127.0.0.1:9000/');
    expect(mockS3ClientConfigs[0]?.forcePathStyle).toBe(true);
    expect(mockS3ClientConfigs[0]?.credentials).toEqual({
      accessKeyId: 'devaccess',
      secretAccessKey: 'devsecret',
    });
  });

  it('refuses to sign an upload for a key it did not generate', async () => {
    // A presigned PUT is direct write authority over exactly that key, so a
    // caller-supplied key would let a client overwrite another object.
    const service = new S3StorageService(buildConfigService());

    await expect(
      service.getSignedUploadUrl({
        key: 'documents/clinic/../../etc/passwd',
        contentType: 'application/pdf',
        contentLengthBytes: 2048,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('refuses to sign an upload outside the MIME allowlist or the size limit', async () => {
    const service = new S3StorageService(buildConfigService({ S3_MAX_UPLOAD_SIZE_BYTES: '1024' }));

    await expect(
      service.getSignedUploadUrl({
        key: VALID_OBJECT_KEY,
        contentType: 'application/zip',
        contentLengthBytes: 512,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getSignedUploadUrl({
        key: VALID_OBJECT_KEY,
        contentType: 'application/pdf',
        contentLengthBytes: 4096,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getSignedUploadUrl({
        key: VALID_OBJECT_KEY,
        contentType: 'application/pdf',
        contentLengthBytes: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('reads object metadata for the upload confirmation step', async () => {
    mockSend.mockResolvedValue({
      ContentLength: 2048,
      ContentType: 'application/pdf',
      ETag: '"etag-value"',
      $metadata: {},
    });
    const service = new S3StorageService(buildConfigService());

    const result = await service.headObject({ key: VALID_OBJECT_KEY });

    expect(result).toEqual({
      key: VALID_OBJECT_KEY,
      sizeBytes: 2048,
      contentType: 'application/pdf',
      etag: '"etag-value"',
    });
  });

  it('throws not found when confirming an upload that never landed', async () => {
    const missingError = new S3ServiceException({
      name: 'NotFound',
      $fault: 'client',
      $metadata: { httpStatusCode: 404 },
    } as never);
    missingError.name = 'NotFound';
    mockSend.mockRejectedValue(missingError);
    const service = new S3StorageService(buildConfigService());

    await expect(service.headObject({ key: VALID_OBJECT_KEY })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws not found when getting a missing object', async () => {
    const missingError = new S3ServiceException({
      name: 'NoSuchKey',
      $fault: 'client',
      $metadata: { httpStatusCode: 404 },
    } as never);
    missingError.name = 'NoSuchKey';
    mockSend.mockRejectedValue(missingError);
    const service = new S3StorageService(buildConfigService());

    await expect(
      service.getObject({ key: 'patients/photos/object-key' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('treats deleting a missing object as an already-completed delete', async () => {
    const missingError = new S3ServiceException({
      name: 'NoSuchKey',
      $fault: 'client',
      $metadata: { httpStatusCode: 404 },
    } as never);
    missingError.name = 'NoSuchKey';
    mockSend.mockRejectedValue(missingError);
    const service = new S3StorageService(buildConfigService());

    const result = await service.deleteObject({ key: 'patients/photos/object-key' });

    expect(result).toEqual({ key: 'patients/photos/object-key', deleted: true });
  });

  it('rethrows unexpected provider errors on delete', async () => {
    mockSend.mockRejectedValue(new Error('provider unavailable'));
    const service = new S3StorageService(buildConfigService());

    await expect(
      service.deleteObject({ key: 'patients/photos/object-key' }),
    ).rejects.toThrow('provider unavailable');
  });
});
