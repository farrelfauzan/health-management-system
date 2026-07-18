import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const mockSend = jest.fn();
const mockGetSignedUrl = jest.fn();

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
    },
    S3ServiceException: MockS3ServiceException,
    PutObjectCommand: class MockPutObjectCommand extends MockCommand {},
    GetObjectCommand: class MockGetObjectCommand extends MockCommand {},
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
  beforeEach(() => {
    jest.clearAllMocks();
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
