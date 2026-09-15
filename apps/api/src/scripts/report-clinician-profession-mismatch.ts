import { Pool } from 'pg';

import { buildClinicianProfessionMismatchReport } from './build-clinician-profession-mismatch-report';
import {
  ClinicianProfessionMismatchBucket,
  ClinicianProfessionRow,
} from './clinician-profession-mismatch-report.types';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/hms_dev?schema=public';

/**
 * The data check before P25-T03 ships: **whose role and clinician profile
 * disagree?** Enforcement reads `doctor_profiles.profession`, so a midwife
 * account registered as a doctor before D-034 is never checked, and the
 * reverse is refused as a midwife.
 *
 * **Mutates nothing** — one `SELECT`, no transaction, no file written — and
 * prints user ids and counts only, never a name. Live rows only: a deleted
 * role grant or profile is not what enforcement reads.
 *
 * Usage: `pnpm --filter @hms/api report:clinician-profession-mismatch`
 */
async function reportClinicianProfessionMismatch(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  });
  try {
    const { rows } = await pool.query<ClinicianProfessionRow>(CLINICIAN_PROFESSION_QUERY);
    const report = buildClinicianProfessionMismatchReport(rows);
    console.log('=== P25-T03 clinician profession mismatch (read-only) ===\n');
    console.log(`Users with a clinician role and a clinician profile: ${report.clinicianUserCount}`);
    printBucket('Role MIDWIFE, profession DOCTOR (never checked)', report.midwifeRoleWithDoctorProfession);
    printBucket('Role DOCTOR, profession MIDWIFE (checked as a midwife)', report.doctorRoleWithMidwifeProfession);
  } finally {
    await pool.end();
  }
}

/** One row per live clinician role grant whose user owns a live clinician profile. */
const CLINICIAN_PROFESSION_QUERY = `
  SELECT ur."user_id"            AS "userId",
         r."code"                AS "roleCode",
         d."profession"::text    AS "profession"
    FROM "user_roles" ur
    JOIN "roles" r            ON r."id" = ur."role_id"
    JOIN "doctor_profiles" d  ON d."owner_user_id" = ur."user_id"
   WHERE r."code" IN ('DOCTOR', 'MIDWIFE')
     AND ur."deleted_at" IS NULL
     AND r."deleted_at" IS NULL
     AND d."deleted_at" IS NULL
`;

function printBucket(label: string, bucket: ClinicianProfessionMismatchBucket): void {
  console.log(`\n${label}: ${bucket.count}`);
  if (bucket.count > 0) {
    console.log(`  user ids: ${bucket.userIds.join(', ')}`);
  }
}

reportClinicianProfessionMismatch().catch((err: unknown) => {
  console.error(
    'Clinician profession mismatch report failed:',
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
