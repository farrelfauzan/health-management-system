/**
 * Shapes for the P25-T03 clinician profession mismatch report.
 *
 * These stay in `apps/api` rather than in `@hms/shared-types` for the same
 * reason as `draft-patient-report.types.ts`: an ops script's internal
 * vocabulary, not an API contract, and no frontend consumes them.
 */

/**
 * One user who holds a clinician role and owns a clinician profile, as the
 * report reads them. Ids and codes only — never a name.
 */
export type ClinicianProfessionRow = {
  userId: string;
  roleCode: string;
  profession: string;
};

/** Rows counted one way, with the user ids that make the count checkable. */
export type ClinicianProfessionMismatchBucket = {
  count: number;
  userIds: string[];
};

/**
 * Where role and profession disagree. Enforcement (P25-T03) reads the
 * profile's `profession`, so a midwife still carrying `DOCTOR` there is never
 * checked, and a doctor carrying `MIDWIFE` is refused what they may do.
 */
export type ClinicianProfessionMismatchReport = {
  /** Distinct users holding a clinician role with a clinician profile. */
  clinicianUserCount: number;
  /** Role `MIDWIFE`, profile `profession = DOCTOR`: escapes every authority check. */
  midwifeRoleWithDoctorProfession: ClinicianProfessionMismatchBucket;
  /** Role `DOCTOR`, profile `profession = MIDWIFE`: refused as a midwife. */
  doctorRoleWithMidwifeProfession: ClinicianProfessionMismatchBucket;
};
