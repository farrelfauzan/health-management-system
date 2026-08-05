import { randomUUID } from 'node:crypto';

import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { S3StorageService } from './s3-storage.service';

/**
 * PCS-T01 acceptance: the object-storage adapter against a real S3-compatible
 * provider — AWS S3 in CI and production, or any S3-compatible endpoint
 * (MinIO from `infra/docker/docker-compose.dev.yml`) locally.
 *
 * `s3-storage.service.spec.ts` covers the adapter's logic with the AWS SDK
 * stubbed, which is the right shape for validation branches and for pinning
 * how the client is configured. What a mock cannot prove is the half of this
 * feature that lives in the provider: that a signature this service mints is
 * one S3 actually honours, that the presigned-upload client's checksum
 * setting produces a URL a plain PUT can use, and — the security-relevant
 * one — that the bucket refuses an unsigned read. Those failures are
 * invisible to a mock and fatal in production.
 *
 * **Opt-in by design.** The suite runs only when `S3_INTEGRATION_TEST_BUCKET`
 * names a bucket, and skips cleanly otherwise, so a normal
 * `pnpm integration:test` needs no cloud credentials. The gate is a dedicated
 * variable rather than `S3_BUCKET` because `S3_BUCKET` has a default in
 * `storage.config.ts`: keying off it would let a misconfigured run write test
 * objects into whatever bucket the app itself is pointed at.
 *
 * Credentials are optional — omit them to use the default AWS provider chain
 * (IAM instance/task role, or `~/.aws`), which is how this should run in CI.
 */
const integrationTestBucket = process.env.S3_INTEGRATION_TEST_BUCKET ?? '';
const describeWhenConfigured = integrationTestBucket === '' ? describe.skip : describe;

if (integrationTestBucket === '') {
  console.warn(
    '[s3-storage.integration] skipped: set S3_INTEGRATION_TEST_BUCKET (and S3_ENDPOINT for a local S3-compatible server) to run the storage round-trip against a real provider.',
  );
}

describeWhenConfigured('S3 storage integration', () => {
  const TEST_KEY_PREFIX = 'documents/clinic';
  const MARKDOWN_CONTENT_TYPE = 'text/markdown';
  const PROVIDER_TIMEOUT_MS = 30_000;
  // `||`, not `??`: CI expands an unconfigured secret to an empty string, and
  // an empty region is a startup error in `resolveStorageConfig` rather than
  // a request to use the default.
  const region = process.env.S3_REGION || 'us-east-1';
  const endpoint = process.env.S3_ENDPOINT ?? '';
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? '';
  const storageEnv: Record<string, string> = {
    S3_REGION: region,
    S3_BUCKET: integrationTestBucket,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE ?? 'false',
    ...(endpoint === '' ? {} : { S3_ENDPOINT: endpoint }),
    // Both or neither: `resolveStorageConfig` rejects a half-set pair rather
    // than silently falling back to the provider chain.
    ...(accessKeyId !== '' && secretAccessKey !== ''
      ? { S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey }
      : {}),
  };

  let storageService: S3StorageService;
  const createdKeys: string[] = [];

  /**
   * Records a key for teardown and returns it, so a failing expectation never
   * leaves objects behind in a bucket shared with the next run.
   */
  function trackKey(key: string): string {
    createdKeys.push(key);
    return key;
  }

  /**
   * The unsigned URL for an object — what a link-sharer or a crawler would
   * construct. Path-style for a custom endpoint (how MinIO addresses
   * buckets), virtual-host style for AWS.
   */
  function buildUnsignedObjectUrl(key: string): string {
    if (endpoint !== '') {
      return `${endpoint.replace(/\/$/, '')}/${integrationTestBucket}/${key}`;
    }
    return `https://${integrationTestBucket}.s3.${region}.amazonaws.com/${key}`;
  }

  beforeAll(async () => {
    storageService = new S3StorageService(new ConfigService(storageEnv));
    // Prove the bucket is reachable and writable here, so a credentials or
    // bucket-name problem reads as itself instead of surfacing inside an
    // assertion about round-tripping bytes.
    const canaryKey = storageService.generateObjectKey({
      keyPrefix: TEST_KEY_PREFIX,
      fileExtension: 'md',
    });
    await storageService
      .uploadObject({
        key: canaryKey,
        body: Buffer.from('# probe\n'),
        contentType: MARKDOWN_CONTENT_TYPE,
      })
      .catch((err: unknown) => {
        throw new Error(
          `Bucket "${integrationTestBucket}" is not writable${endpoint === '' ? ` in region ${region}` : ` at ${endpoint}`}. Check S3_INTEGRATION_TEST_BUCKET, the region, and the credentials available to this process. Cause: ${String(err)}`,
        );
      });
    await storageService.deleteObject({ key: canaryKey });
  }, PROVIDER_TIMEOUT_MS);

  afterAll(async () => {
    await Promise.all(createdKeys.map((key) => storageService.deleteObject({ key })));
  }, PROVIDER_TIMEOUT_MS);

  it(
    'round-trips an uploaded object through the private bucket',
    async () => {
      const inputKey = trackKey(
        storageService.generateObjectKey({ keyPrefix: TEST_KEY_PREFIX, fileExtension: 'md' }),
      );
      const inputBody = Buffer.from(`# Clinic FAQ\n\nJam praktik: 08:00-16:00. ${randomUUID()}\n`);
      const actualUpload = await storageService.uploadObject({
        key: inputKey,
        body: inputBody,
        contentType: MARKDOWN_CONTENT_TYPE,
      });
      const actualObject = await storageService.getObject({ key: inputKey });
      expect(actualUpload.key).toBe(inputKey);
      expect(actualObject.body.equals(inputBody)).toBe(true);
      expect(actualObject.contentType).toBe(MARKDOWN_CONTENT_TYPE);
    },
    PROVIDER_TIMEOUT_MS,
  );

  it(
    'reports stored metadata through headObject',
    async () => {
      const inputKey = trackKey(
        storageService.generateObjectKey({ keyPrefix: TEST_KEY_PREFIX, fileExtension: 'md' }),
      );
      const inputBody = Buffer.from(`# SOP pendaftaran ${randomUUID()}\n`);
      await storageService.uploadObject({
        key: inputKey,
        body: inputBody,
        contentType: MARKDOWN_CONTENT_TYPE,
      });
      const actualHead = await storageService.headObject({ key: inputKey });
      expect(actualHead.sizeBytes).toBe(inputBody.byteLength);
      expect(actualHead.contentType).toBe(MARKDOWN_CONTENT_TYPE);
      expect(actualHead.etag).toBeDefined();
    },
    PROVIDER_TIMEOUT_MS,
  );

  it(
    'downloads the object through a presigned URL',
    async () => {
      const inputKey = trackKey(
        storageService.generateObjectKey({ keyPrefix: TEST_KEY_PREFIX, fileExtension: 'md' }),
      );
      const inputBody = Buffer.from(`# Alur rujukan ${randomUUID()}\n`);
      await storageService.uploadObject({
        key: inputKey,
        body: inputBody,
        contentType: MARKDOWN_CONTENT_TYPE,
      });
      const actualSignedUrl = await storageService.getSignedUrl({ key: inputKey });
      const actualResponse = await fetch(actualSignedUrl.url);
      const actualBody = Buffer.from(await actualResponse.arrayBuffer());
      expect(actualResponse.status).toBe(200);
      expect(actualBody.equals(inputBody)).toBe(true);
      expect(Date.parse(actualSignedUrl.expiresAt)).toBeGreaterThan(Date.now());
    },
    PROVIDER_TIMEOUT_MS,
  );

  it(
    'refuses an unsigned read of the same object',
    async () => {
      const inputKey = trackKey(
        storageService.generateObjectKey({ keyPrefix: TEST_KEY_PREFIX, fileExtension: 'md' }),
      );
      const inputBody = Buffer.from(`# Tarif poli ${randomUUID()}\n`);
      await storageService.uploadObject({
        key: inputKey,
        body: inputBody,
        contentType: MARKDOWN_CONTENT_TYPE,
      });
      // The presigned download above proves the object is readable *with* a
      // signature. This proves the bucket grants nothing without one — the
      // difference between a knowledge base and a public file host. The
      // status code varies by provider and by whether the caller may list the
      // bucket, so what is asserted is the property that matters: the request
      // fails and the bytes do not come back.
      const actualResponse = await fetch(buildUnsignedObjectUrl(inputKey));
      const actualBodyText = await actualResponse.text();
      expect(actualResponse.ok).toBe(false);
      expect([401, 403, 404]).toContain(actualResponse.status);
      expect(actualBodyText).not.toContain('Tarif poli');
    },
    PROVIDER_TIMEOUT_MS,
  );

  it(
    'accepts a browser-direct upload through a presigned upload URL',
    async () => {
      const inputKey = trackKey(
        storageService.generateObjectKey({ keyPrefix: TEST_KEY_PREFIX, fileExtension: 'md' }),
      );
      const inputBody = Buffer.from(`# Prosedur BPJS ${randomUUID()}\n`);
      const actualSignedUpload = await storageService.getSignedUploadUrl({
        key: inputKey,
        contentType: MARKDOWN_CONTENT_TYPE,
        contentLengthBytes: inputBody.byteLength,
      });
      const actualPutResponse = await fetch(actualSignedUpload.url, {
        method: 'PUT',
        headers: actualSignedUpload.requiredHeaders,
        body: new Uint8Array(inputBody),
      });
      expect(actualPutResponse.status).toBe(200);
      // Confirm from the bucket, not from the PUT status: the confirm step of
      // a direct upload is a `headObject`, because a client's claim about what
      // it uploaded is not evidence of what is stored.
      const actualHead = await storageService.headObject({ key: inputKey });
      expect(actualHead.sizeBytes).toBe(inputBody.byteLength);
      expect(actualHead.contentType).toBe(MARKDOWN_CONTENT_TYPE);
    },
    PROVIDER_TIMEOUT_MS,
  );

  it(
    'rejects a presigned upload whose content type is changed by the client',
    async () => {
      const inputKey = trackKey(
        storageService.generateObjectKey({ keyPrefix: TEST_KEY_PREFIX, fileExtension: 'md' }),
      );
      const inputBody = Buffer.from(`# Dokumen ${randomUUID()}\n`);
      const actualSignedUpload = await storageService.getSignedUploadUrl({
        key: inputKey,
        contentType: MARKDOWN_CONTENT_TYPE,
        contentLengthBytes: inputBody.byteLength,
      });
      // `content-type` is signed deliberately (see `getSignedUploadUrl`),
      // which is what keeps the MIME allowlist enforceable on a path where the
      // server never sees the bytes. If the provider accepted this, the
      // allowlist would be advisory.
      const actualPutResponse = await fetch(actualSignedUpload.url, {
        method: 'PUT',
        headers: { ...actualSignedUpload.requiredHeaders, 'Content-Type': 'application/pdf' },
        body: new Uint8Array(inputBody),
      });
      expect(actualPutResponse.ok).toBe(false);
      await expect(storageService.headObject({ key: inputKey })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
    PROVIDER_TIMEOUT_MS,
  );

  it(
    'deletes an object idempotently',
    async () => {
      const inputKey = storageService.generateObjectKey({
        keyPrefix: TEST_KEY_PREFIX,
        fileExtension: 'md',
      });
      await storageService.uploadObject({
        key: inputKey,
        body: Buffer.from(`# Sementara ${randomUUID()}\n`),
        contentType: MARKDOWN_CONTENT_TYPE,
      });
      const actualFirstDelete = await storageService.deleteObject({ key: inputKey });
      const actualSecondDelete = await storageService.deleteObject({ key: inputKey });
      expect(actualFirstDelete.deleted).toBe(true);
      expect(actualSecondDelete.deleted).toBe(true);
      await expect(storageService.getObject({ key: inputKey })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
    PROVIDER_TIMEOUT_MS,
  );
});
