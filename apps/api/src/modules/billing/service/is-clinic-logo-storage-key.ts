import { CLINIC_LOGO_STAGED_KEY_PREFIX } from './clinic-logo-storage-key-prefix';

const STAGED_LOGO_KEY_PATTERN = new RegExp(
  `^${CLINIC_LOGO_STAGED_KEY_PREFIX}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\\.[a-z0-9]{1,10})?$`,
);

/**
 * Whether a key is one this module minted for a logo upload.
 *
 * The PATCH is the one place a caller-supplied key reaches storage, so it is
 * the one place the key must be proven rather than trusted. Without this, a
 * PATCH naming another feature's object — a patient's uploaded scan, say —
 * would make it the clinic's letterhead and hand a signed URL for it to
 * everyone who can read the profile.
 */
export function isStagedClinicLogoStorageKey(storageKey: string): boolean {
  return STAGED_LOGO_KEY_PATTERN.test(storageKey);
}
