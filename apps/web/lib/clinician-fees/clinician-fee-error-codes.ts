/** Refusals the jasa medis screens explain in the reader's language (P27-T06). */
export const CLINICIAN_FEE_ERROR_CODES = [
  'CLINICIAN_FEE_RULE_OVERLAP',
  'CLINICIAN_FEE_RULE_TARGET_INVALID',
] as const;

export type ClinicianFeeErrorCode = (typeof CLINICIAN_FEE_ERROR_CODES)[number];
