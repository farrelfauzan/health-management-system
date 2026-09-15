import { buildDoctorAuthorityGrantDocumentKeyPrefix } from './build-doctor-authority-grant-document-key-prefix';

const UUID_SEGMENT = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Whether a key is one the upload-url route minted for *this* clinician
 * (P25-T02). The create and update routes are where a caller-supplied key
 * reaches storage, so it is proven rather than trusted: a vault key, a
 * knowledge-base key, or another midwife's grant document are all refused.
 */
export function isDoctorAuthorityGrantDocumentStorageKey(
  storageKey: string,
  doctorId: string,
): boolean {
  const prefix = buildDoctorAuthorityGrantDocumentKeyPrefix(doctorId);
  return new RegExp(`^${prefix}/${UUID_SEGMENT}(?:\\.[a-z0-9]{1,10})?$`).test(storageKey);
}
