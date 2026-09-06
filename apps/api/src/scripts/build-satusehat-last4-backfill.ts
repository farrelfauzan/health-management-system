import { SatusehatLast4BackfillPlan, SatusehatLast4BackfillRow } from './satusehat-last4-backfill.types';

const MASK_VISIBLE_CHARACTERS = 4;

/**
 * Decides what the backfill will write, separately from writing it, so the
 * decision is testable without a database: which rows get which partial value,
 * and which are left alone because their ciphertext will not decrypt.
 *
 * A row that fails to decrypt is a key-rotation or corruption problem. It is
 * named for an operator rather than filled with a guess — a wrong partial
 * value is worse than an absent one, because staff would compare it against
 * the portal and conclude the wrong thing.
 */
export function buildSatusehatLast4Backfill(
  rows: readonly SatusehatLast4BackfillRow[],
  decrypt: (ciphertext: string) => string,
): SatusehatLast4BackfillPlan {
  const updates: Array<{ patientId: string; last4: string }> = [];
  const undecryptablePatientIds: string[] = [];
  for (const row of rows) {
    try {
      const ihsNumber = decrypt(row.satusehat_patient_id_ciphertext);
      updates.push({ patientId: row.id, last4: ihsNumber.slice(-MASK_VISIBLE_CHARACTERS) });
    } catch {
      undecryptablePatientIds.push(row.id);
    }
  }
  return { updates, undecryptablePatientIds };
}
