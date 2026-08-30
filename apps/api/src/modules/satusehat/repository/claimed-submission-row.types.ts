import { SatusehatSubmissionStatusValue } from '@hms/shared-types';

/**
 * Snake-case shape of the claim statement's `RETURNING` clause. Raw SQL bypasses
 * Prisma's column mapping, so the claim reads database column names directly
 * and renames them before anything leaves the repository. Kept out of
 * `@hms/shared-types` deliberately: these are physical column names, not part
 * of any contract the frontend or another module may depend on.
 */
export type ClaimedSubmissionRow = {
  id: string;
  encounter_id: string;
  status: SatusehatSubmissionStatusValue;
  attempts: number;
  last_error: string | null;
  next_attempt_at: Date;
  last_attempt_at: Date | null;
  submitted_at: Date | null;
  satusehat_encounter_id: string | null;
  created_at: Date;
  updated_at: Date;
};
