/**
 * Where clinic-logo objects live in the bucket.
 *
 * A prefix of its own rather than sharing the document store's: the confirm
 * step proves an inbound key against exactly this shape, and a shared prefix
 * would let a clinic-document key be confirmed as a logo — turning any
 * uploaded PDF into a signed download that every logo reader can fetch.
 *
 * Two sub-prefixes under it, and the split is load-bearing. `staged/` is what
 * a browser PUTs to; `stored/` is what the server writes after decoding and
 * re-encoding the bytes. Only a `stored/` key is ever recorded on the row, so
 * the object an invoice renders is always one this process produced, never
 * one a client uploaded.
 */
export const CLINIC_LOGO_STAGED_KEY_PREFIX = 'clinic-profile/logo/staged';

export const CLINIC_LOGO_STORED_KEY_PREFIX = 'clinic-profile/logo/stored';
