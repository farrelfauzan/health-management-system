import {
  ClinicianProfessionMismatchBucket,
  ClinicianProfessionMismatchReport,
  ClinicianProfessionRow,
} from './clinician-profession-mismatch-report.types';

/**
 * Turns role/profession pairs into the two mismatch buckets (P25-T03).
 *
 * Pure, so the counting rule can be argued with in a unit test; the script
 * around it does the read-only SQL and the printing. A user holding both
 * clinician roles is counted in whichever bucket their profile contradicts,
 * and each user appears at most once per bucket.
 */
export function buildClinicianProfessionMismatchReport(
  rows: readonly ClinicianProfessionRow[],
): ClinicianProfessionMismatchReport {
  return {
    clinicianUserCount: new Set(rows.map((row) => row.userId)).size,
    midwifeRoleWithDoctorProfession: toBucket(rows, { roleCode: 'MIDWIFE', profession: 'DOCTOR' }),
    doctorRoleWithMidwifeProfession: toBucket(rows, { roleCode: 'DOCTOR', profession: 'MIDWIFE' }),
  };
}

function toBucket(
  rows: readonly ClinicianProfessionRow[],
  mismatch: { roleCode: string; profession: string },
): ClinicianProfessionMismatchBucket {
  const userIds = [
    ...new Set(
      rows
        .filter(
          (row) => row.roleCode === mismatch.roleCode && row.profession === mismatch.profession,
        )
        .map((row) => row.userId),
    ),
  ].sort();
  return { count: userIds.length, userIds };
}
