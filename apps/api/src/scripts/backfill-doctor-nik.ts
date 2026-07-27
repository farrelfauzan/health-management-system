import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

import { NationalIdentifierCryptoService } from '../common/crypto/national-identifier-crypto.service';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/hms_dev?schema=public';
const NIK_LENGTH = 16;

type PendingDoctorRow = {
  id: string;
  nik: string;
};

/**
 * Step 2 of the doctor NIK encryption sequence: encrypts every plaintext
 * `doctor_profiles.nik` left by the expand migration into the
 * ciphertext/blind-index/last4 columns. The contract migration then drops the
 * plaintext column, and refuses to run while any row remains unencrypted.
 *
 * Idempotent — rows that already carry ciphertext are skipped, so a partial run
 * can simply be repeated. Never logs a NIK.
 */
async function backfillDoctorNik(): Promise<void> {
  const crypto = new NationalIdentifierCryptoService(new ConfigService());
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  });
  try {
    const { rows } = await pool.query<PendingDoctorRow>(
      'SELECT "id", "nik" FROM "doctor_profiles" WHERE "nik" IS NOT NULL AND "nik_ciphertext" IS NULL',
    );
    if (rows.length === 0) {
      console.log('Nothing to backfill: no doctor holds an unencrypted NIK.');
      return;
    }
    console.log(`Encrypting ${rows.length} doctor NIK(s)...`);
    const skippedDoctorIds: string[] = [];
    let encryptedCount = 0;
    for (const row of rows) {
      const normalisedNik = row.nik.replace(/\D/g, '');
      if (normalisedNik.length !== NIK_LENGTH) {
        // Never guess at a malformed value: leave the row for an operator to
        // correct, and let the contract migration's guard block the drop.
        skippedDoctorIds.push(row.id);
        continue;
      }
      const encrypted = crypto.encryptSearchableIdentifier(normalisedNik);
      await pool.query(
        'UPDATE "doctor_profiles" SET "nik_ciphertext" = $1, "nik_index" = $2, "nik_last4" = $3, "nik_key_version" = $4 WHERE "id" = $5',
        [encrypted.ciphertext, encrypted.index, encrypted.last4, encrypted.keyVersion, row.id],
      );
      encryptedCount += 1;
    }
    console.log(`Encrypted ${encryptedCount} doctor NIK(s).`);
    if (skippedDoctorIds.length > 0) {
      console.error(
        `Skipped ${skippedDoctorIds.length} doctor(s) whose NIK is not ${NIK_LENGTH} digits. Correct these rows, then re-run:\n${skippedDoctorIds.join('\n')}`,
      );
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

backfillDoctorNik().catch((err: unknown) => {
  console.error('Doctor NIK backfill failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
