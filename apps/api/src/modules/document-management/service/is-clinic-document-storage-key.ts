import { CLINIC_DOCUMENT_STORAGE_KEY_PREFIX } from './clinic-document-storage-key-prefix';

const CLINIC_DOCUMENT_STORAGE_KEY_PATTERN = new RegExp(
  `^${CLINIC_DOCUMENT_STORAGE_KEY_PREFIX}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\\.[a-z0-9]{1,10})?$`,
);

/**
 * Whether a key is one this module minted for the clinic corpus.
 *
 * The confirm step is the one place a caller-supplied key reaches storage, so
 * it is the one place the key must be proven rather than trusted. Without
 * this, a confirm call naming another feature's object — a patient's uploaded
 * ID photo, say — would attach a clinic document row to it and hand every
 * admin a signed download URL for a file they were never granted.
 */
export function isClinicDocumentStorageKey(storageKey: string): boolean {
  return CLINIC_DOCUMENT_STORAGE_KEY_PATTERN.test(storageKey);
}
