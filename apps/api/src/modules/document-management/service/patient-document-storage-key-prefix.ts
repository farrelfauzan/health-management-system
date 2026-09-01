/**
 * Where patient clinical files live in the bucket (`P16-T08`): the strategy
 * §4.3 layout, `documents/{ownerType}/` plus a server-minted uuid. Neither
 * the patient id nor the uploader's filename is in the key — object keys
 * reach logs, referrer headers and backups, and a key naming a patient turns
 * each of those into a disclosure. The patient lives in the `patient_id`
 * column, which is also the only place access control reads it from.
 */
export const PATIENT_DOCUMENT_STORAGE_KEY_PREFIX = 'documents/patient';
