/**
 * Script-internal shapes for the `P10-T13` partial-IHS backfill. They name
 * database columns directly and never leave `apps/api`, so they stay here
 * rather than in `@hms/shared-types`.
 */
export type SatusehatLast4BackfillRow = {
  readonly id: string;
  readonly satusehat_patient_id_ciphertext: string;
};

export type SatusehatLast4BackfillPlan = {
  readonly updates: ReadonlyArray<{ patientId: string; last4: string }>;
  readonly undecryptablePatientIds: readonly string[];
};
