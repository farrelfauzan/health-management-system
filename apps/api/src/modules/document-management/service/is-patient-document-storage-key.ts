import { PATIENT_DOCUMENT_STORAGE_KEY_PREFIX } from './patient-document-storage-key-prefix';

const UUID_SEGMENT = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Whether a key is one this module minted for the patient-document store.
 *
 * The confirm step is the one place a caller-supplied key reaches storage, so
 * it is the one place the key must be proven rather than trusted: a clinic or
 * personal-corpus key fails this test, so a clinical row can never point at
 * an object another surface produced — or the other way around.
 */
export function isPatientDocumentStorageKey(storageKey: string): boolean {
  return new RegExp(
    `^${PATIENT_DOCUMENT_STORAGE_KEY_PREFIX}/${UUID_SEGMENT}(?:\\.[a-z0-9]{1,10})?$`,
  ).test(storageKey);
}
