import { MANAGED_DOCUMENT_STORAGE_KEY_PREFIX } from './managed-document-storage-key-prefix';

const UUID_SEGMENT = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Whether a key is one this module minted for an uploaded registry document.
 *
 * A caller-supplied key reaches storage at exactly one point — recording an
 * upload — so that is where the key must be proven rather than trusted: a
 * patient-file, vault or corpus key fails this test, so a registry row can
 * never point at an object another surface produced, or the other way round.
 */
export function isManagedDocumentStorageKey(storageKey: string): boolean {
  return new RegExp(
    `^${MANAGED_DOCUMENT_STORAGE_KEY_PREFIX}/${UUID_SEGMENT}(?:\\.[a-z0-9]{1,10})?$`,
  ).test(storageKey);
}
