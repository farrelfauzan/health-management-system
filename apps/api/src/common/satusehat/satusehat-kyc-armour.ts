/**
 * The PEM-style armour the KYC service wraps every encrypted body in, on both
 * legs. The platform's own parser answers `missing begin tag` to a body
 * without the first line (P21-T01), so these strings are the contract, not a
 * convention.
 */
export const SATUSEHAT_KYC_ARMOUR = {
  BEGIN: '-----BEGIN ENCRYPTED MESSAGE-----',
  END: '-----END ENCRYPTED MESSAGE-----',
} as const;
