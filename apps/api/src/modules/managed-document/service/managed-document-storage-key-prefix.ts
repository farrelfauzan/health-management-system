/**
 * Where uploaded registry documents live in the bucket (`P16-T28`/`T36`):
 * the strategy §4.3 layout with its own owner segment plus a server-minted
 * uuid. Neither a party's name nor the uploader's filename is in the key —
 * object keys reach logs, referrer headers and backups, and a key naming a
 * patient turns each of those into a disclosure.
 */
export const MANAGED_DOCUMENT_STORAGE_KEY_PREFIX = 'documents/managed';
