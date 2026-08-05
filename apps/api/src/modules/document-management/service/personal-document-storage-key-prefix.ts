import { DocumentOwnerTypeValue } from '@hms/shared-types';

/**
 * Where a user's own knowledge-base objects live in the bucket.
 *
 * The layout is the one strategy §4.3 settled on — `documents/{ownerType}/`
 * followed by a server-minted uuid — so a personal document sits beside the
 * clinic corpus under a prefix that names only its owner *type*. The owner's
 * user id is deliberately not in the key: object keys reach logs, referrer
 * headers and backups, and a key that identifies a person turns each of those
 * into a disclosure about who keeps which documents. Ownership lives in the
 * `owner_id` column, which is also the only place retrieval reads it from.
 */
export function buildPersonalDocumentStorageKeyPrefix(
  ownerType: Extract<DocumentOwnerTypeValue, 'DOCTOR' | 'ADMIN'>,
): string {
  return `documents/${ownerType.toLowerCase()}`;
}
