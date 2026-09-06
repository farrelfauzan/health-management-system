import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

import { NationalIdentifierCryptoService } from '../common/crypto/national-identifier-crypto.service';
import { buildSatusehatLast4Backfill } from './build-satusehat-last4-backfill';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/hms_dev?schema=public';

/**
 * Fills `patient_profiles.satusehat_patient_id_last4` for patients linked
 * before `P10-T13` added the column. The value has to be derived from the
 * decrypted IHS number, which a SQL migration cannot do — the key lives in the
 * application's environment, not the database.
 *
 * Idempotent: rows that already carry a last4 are not selected, so a partial
 * run is simply repeated. Counts only ever reach the log — never an IHS
 * number, and never a patient's identifiers.
 */
async function backfillSatusehatLast4(): Promise<void> {
  const crypto = new NationalIdentifierCryptoService(new ConfigService());
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL });
  try {
    const { rows } = await pool.query<{ id: string; satusehat_patient_id_ciphertext: string }>(
      'SELECT "id", "satusehat_patient_id_ciphertext" FROM "patient_profiles" WHERE "satusehat_patient_id_ciphertext" IS NOT NULL AND "satusehat_patient_id_last4" IS NULL',
    );
    if (rows.length === 0) {
      console.log('Nothing to backfill: every linked patient already carries a partial IHS number.');
      return;
    }
    console.log(`Deriving the partial IHS number for ${rows.length} linked patient(s)...`);
    const result = buildSatusehatLast4Backfill(rows, (ciphertext) =>
      crypto.decryptIdentifier(ciphertext),
    );
    for (const update of result.updates) {
      await pool.query(
        'UPDATE "patient_profiles" SET "satusehat_patient_id_last4" = $1 WHERE "id" = $2',
        [update.last4, update.patientId],
      );
    }
    console.log(`Filled ${result.updates.length} patient(s).`);
    if (result.undecryptablePatientIds.length > 0) {
      // A ciphertext that will not decrypt is a key-rotation or corruption
      // problem, not something to paper over with a guessed value: name the
      // rows and let an operator decide.
      console.error(
        `Skipped ${result.undecryptablePatientIds.length} patient(s) whose stored IHS number could not be decrypted:\n${result.undecryptablePatientIds.join('\n')}`,
      );
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

backfillSatusehatLast4().catch(() => {
  console.error('SATUSEHAT partial IHS number backfill failed');
  process.exit(1);
});
