import { DocumentOwnerTypeValue } from '@hms/shared-types';

import { buildPersonalDocumentStorageKeyPrefix } from './personal-document-storage-key-prefix';

const UUID_SEGMENT = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Whether a key is one this module minted for *this owner type's* personal
 * corpus.
 *
 * The confirm step is the one place a caller-supplied key reaches storage, so
 * it is the one place the key must be proven rather than trusted. The owner
 * type is checked rather than accepting any personal prefix: without it a
 * doctor could confirm against a key minted under `documents/admin`, and the
 * row would claim an object the clinician's own upload never produced.
 *
 * A clinic key fails this test, which is the case that matters most — it is
 * the difference between "a document in my knowledge base" and a row pointing
 * at the shared corpus.
 */
export function isPersonalDocumentStorageKey(
  storageKey: string,
  ownerType: Extract<DocumentOwnerTypeValue, 'DOCTOR' | 'ADMIN'>,
): boolean {
  const prefix = buildPersonalDocumentStorageKeyPrefix(ownerType);
  return new RegExp(`^${prefix}/${UUID_SEGMENT}(?:\\.[a-z0-9]{1,10})?$`).test(storageKey);
}
