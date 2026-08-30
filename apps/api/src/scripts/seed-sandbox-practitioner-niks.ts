import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

import { NationalIdentifierCryptoService } from '../common/crypto/national-identifier-crypto.service';
import { resolveSatusehatConfig } from '../common/satusehat/satusehat.config';
import { SATUSEHAT_SANDBOX_PRACTITIONERS } from '../modules/satusehat/fixtures/satusehat-sandbox-practitioners';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/hms_dev?schema=public';
const SANDBOX_HOSTNAME = 'api-satusehat-stg.dto.kemkes.go.id';

type UnlinkedDoctorRow = {
  id: string;
  full_name: string;
};

/**
 * Fills the practitioner NIK of every active doctor that has none, from the
 * staging test identities in `SATUSEHAT_SANDBOX_PRACTITIONERS` (SJ-75). Without
 * a NIK there is nothing to look up in the master practitioner index, so every
 * encounter that doctor handles fails SATUSEHAT submission permanently — this
 * is what unblocks a sandbox clinic end to end.
 *
 * Any stored IHS practitioner number is cleared along with the write: it was
 * resolved from a different identity (or, in a seeded database, never resolved
 * at all), and submission short-circuits on a stored number instead of
 * re-resolving it — so a stale one sends a Practitioner reference the platform
 * cannot resolve and the encounter is rejected permanently.
 *
 * Refuses to run unless the adapter points at the staging sandbox: these are
 * test identifiers and must never reach a production database. Idempotent —
 * doctors that already hold a NIK are left untouched, so a partial run is safe
 * to repeat. Never logs a NIK.
 */
async function seedSandboxPractitionerNiks(): Promise<void> {
  assertSandboxTarget();
  const crypto = new NationalIdentifierCryptoService(new ConfigService());
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  });
  try {
    const availableNiks = await findUnusedSandboxNiks(pool, crypto);
    const { rows } = await pool.query<UnlinkedDoctorRow>(
      'SELECT "id", "full_name" FROM "doctor_profiles" WHERE "deleted_at" IS NULL AND "is_active" = true AND "nik_index" IS NULL ORDER BY "created_at" ASC',
    );
    if (rows.length === 0) {
      console.log('Every active doctor already has a NIK.');
    }
    const assignments = rows
      .slice(0, availableNiks.length)
      .map((doctor, index) => ({ doctor, nik: availableNiks[index] as string }));
    if (assignments.length > 0) {
      console.log(`Assigning sandbox practitioner NIKs to ${assignments.length} doctor(s)...`);
    }
    for (const [position, assignment] of assignments.entries()) {
      const encrypted = crypto.encryptSearchableIdentifier(assignment.nik);
      await pool.query(
        'UPDATE "doctor_profiles" SET "nik_ciphertext" = $1, "nik_index" = $2, "nik_last4" = $3, "nik_key_version" = $4, "satusehat_practitioner_id" = NULL, "updated_at" = now() WHERE "id" = $5',
        [
          encrypted.ciphertext,
          encrypted.index,
          encrypted.last4,
          encrypted.keyVersion,
          assignment.doctor.id,
        ],
      );
      console.log(`  ${assignment.doctor.full_name} → sandbox practitioner #${position + 1}`);
    }
    reportShortfall(rows.length - assignments.length);
  } finally {
    await pool.end();
  }
}

/**
 * The test practitioners are only real inside the Kemenkes staging sandbox, and
 * a NIK is citizen-identifier-shaped whatever its provenance. Keying the guard
 * on the resolved FHIR host means a deployment cannot seed them by forgetting a
 * separate opt-out flag.
 */
function assertSandboxTarget(): void {
  const satusehatConfig = resolveSatusehatConfig(new ConfigService());
  const hostname = new URL(satusehatConfig.fhirBaseUrl).hostname;
  if (hostname !== SANDBOX_HOSTNAME) {
    throw new Error(
      `Refusing to seed test NIKs: SATUSEHAT_FHIR_BASE_URL points at ${hostname}, not the ${SANDBOX_HOSTNAME} sandbox`,
    );
  }
}

/**
 * Drops the fixtures already held by a doctor. `nik_index` is unique, so
 * re-assigning one would fail the update — and on a re-run after new doctors
 * were added, the previously seeded rows must keep the NIKs they were linked
 * under.
 */
async function findUnusedSandboxNiks(
  pool: Pool,
  crypto: NationalIdentifierCryptoService,
): Promise<string[]> {
  const indexByNik = new Map(
    SATUSEHAT_SANDBOX_PRACTITIONERS.map((practitioner) => [
      crypto.computeBlindIndex(practitioner.nik),
      practitioner.nik,
    ]),
  );
  const { rows } = await pool.query<{ nik_index: string }>(
    'SELECT "nik_index" FROM "doctor_profiles" WHERE "nik_index" = ANY($1::text[])',
    [[...indexByNik.keys()]],
  );
  for (const row of rows) {
    indexByNik.delete(row.nik_index);
  }
  return [...indexByNik.values()];
}

function reportShortfall(unseededCount: number): void {
  if (unseededCount === 0) {
    return;
  }
  console.error(
    `${unseededCount} doctor(s) still have no NIK: the sandbox publishes only ${SATUSEHAT_SANDBOX_PRACTITIONERS.length} test practitioners. Deactivate the extras or give them real NIKs before submitting their encounters.`,
  );
  process.exitCode = 1;
}

seedSandboxPractitionerNiks().catch((caughtError: unknown) => {
  console.error(
    caughtError instanceof Error
      ? `Sandbox practitioner NIK seed failed: ${caughtError.message}`
      : 'Sandbox practitioner NIK seed failed',
  );
  process.exit(1);
});
