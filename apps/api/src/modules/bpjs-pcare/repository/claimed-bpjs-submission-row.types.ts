import { BpjsSubmissionStatusValue, BpjsSubmissionTypeValue } from '@hms/shared-types';

/**
 * Snake-case shape of the claim statement's `RETURNING` clause. Raw SQL bypasses
 * Prisma's column mapping, so the claim reads database column names directly
 * and renames them before anything leaves the repository. Kept out of
 * `@hms/shared-types` deliberately: these are physical column names, not part
 * of any contract the frontend or another module may depend on.
 */
export type ClaimedBpjsSubmissionRow = {
  id: string;
  registration_id: string;
  type: BpjsSubmissionTypeValue;
  status: BpjsSubmissionStatusValue;
  attempts: number;
  last_error: string | null;
  next_attempt_at: Date;
  last_attempt_at: Date | null;
  submitted_at: Date | null;
  bpjs_reference_no: string | null;
  submitted_kd_poli: string | null;
  created_at: Date;
};
