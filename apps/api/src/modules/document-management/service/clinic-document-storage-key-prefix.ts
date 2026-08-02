/**
 * Where clinic-corpus objects live in the bucket.
 *
 * The customer-service strategy originally sketched
 * `{env}/{facilityId|_}/{ownerType}/{documentId}/{filename}`. That layout is
 * not reachable through {@link ObjectStorageService.generateObjectKey} and
 * should not be: the uploader's filename would put a human-chosen string —
 * potentially a patient's name — into an object key, and the document id is
 * not known until after the upload it would have to name. The environment is
 * already the bucket, and `facilityId` is null in a single-tenant
 * deployment, so both segments would be constants.
 *
 * What ships instead is `documents/clinic/<uuid>.<ext>`: opaque, minted by
 * the server, and the only shape the presigned-upload guard accepts — a key
 * that arrived in a request body can never be signed.
 */
export const CLINIC_DOCUMENT_STORAGE_KEY_PREFIX = 'documents/clinic';
