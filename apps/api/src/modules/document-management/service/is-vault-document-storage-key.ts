import { VaultDocumentOwnerTypeValue } from '@hms/shared-types';

import { buildVaultDocumentStorageKeyPrefix } from './vault-document-storage-key-prefix';

const UUID_SEGMENT = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Whether a key is one this module minted for *this owner type's* vault
 * (`P16-T16`).
 *
 * The confirm step is the one place a caller-supplied key reaches storage, so
 * it is the one place the key must be proven rather than trusted. The case
 * that matters most here is a personal knowledge-base key: `documents/doctor`
 * and `documents/vault/doctor` are one path segment apart, and confirming a
 * KB object into the vault — or a vault object into the KB, where ingestion
 * would send its pages to an embedding provider — is exactly the mistake the
 * two prefixes exist to make impossible.
 */
export function isVaultDocumentStorageKey(
  storageKey: string,
  ownerType: VaultDocumentOwnerTypeValue,
): boolean {
  const prefix = buildVaultDocumentStorageKeyPrefix(ownerType);
  return new RegExp(`^${prefix}/${UUID_SEGMENT}(?:\\.[a-z0-9]{1,10})?$`).test(storageKey);
}
