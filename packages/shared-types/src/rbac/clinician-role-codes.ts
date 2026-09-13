/**
 * The role codes that mean "a clinician": someone who examines patients and
 * signs clinical records (D-034, P24-T02).
 *
 * Every check that asks "is this user a clinician" reads this list rather than
 * the literal `'DOCTOR'`, so adding a clinician role is one edit here instead
 * of a search across the codebase. Role *assignment* is a different question:
 * which role a new clinician receives follows their profession (P24-T03).
 */
export const CLINICIAN_ROLE_CODES = ['DOCTOR', 'MIDWIFE'] as const;
