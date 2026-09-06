import { z } from 'zod';

/**
 * Where one round of review stands (`P16-T29`, §7.5.4). Mirrors the Prisma
 * `DocumentApprovalStatus` enum.
 *
 * `SUPERSEDED` is not a variant of `WITHDRAWN`. A withdrawal is the drafter
 * changing their mind about asking; a supersede is the artefact having
 * changed under the panel (FR-E5-15), and only one of the two is worth
 * telling the approvers about.
 */
export const DOCUMENT_APPROVAL_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'SUPERSEDED',
] as const;

export const documentApprovalStatusSchema = z.enum(DOCUMENT_APPROVAL_STATUSES);

export type DocumentApprovalStatusValue = z.infer<typeof documentApprovalStatusSchema>;

/**
 * The panel one round may name. The floor is 1 — a round with no approver is
 * a document nobody can issue — and the ceiling matches the default-approver
 * cap on the type row, so a picker pre-filled from a type can always be
 * submitted as-is.
 */
export const MIN_DOCUMENT_APPROVAL_APPROVERS = 1;

export const MAX_DOCUMENT_APPROVAL_APPROVERS = 10;

export const MAX_DOCUMENT_APPROVAL_REASON_LENGTH = 1_000;

/**
 * Submit a document for approval (FR-E5-09/10).
 *
 * The drafter names *who* approves this document and *when it is due*, at the
 * moment they know what it is (D-028). There is no approver registry and no
 * per-division routing table to consult: any staff account may be named, and
 * the service refuses a panel containing a `PATIENT`.
 *
 * `dueAt` is optional, and where it is set it buys reminders and an overdue
 * flag and nothing else (FR-E5-28). No code path treats a passed deadline as
 * a decision.
 */
export const submitDocumentForApprovalSchema = z
  .object({
    approverIds: z
      .array(z.string().uuid())
      .min(MIN_DOCUMENT_APPROVAL_APPROVERS)
      .max(MAX_DOCUMENT_APPROVAL_APPROVERS)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Each approver may appear once',
      }),
    dueAt: z.string().datetime().optional(),
  })
  .strict();

export type SubmitDocumentForApprovalInput = z.infer<typeof submitDocumentForApprovalSchema>;

/**
 * Reject a round (FR-E5-17). The reason is required by the schema, by the
 * service and by a CHECK on the table — three refusals for one rule, because
 * "returned to draft" with no explanation is the failure the rule exists to
 * prevent and it is the drafter, not the approver, who pays for it.
 */
export const rejectDocumentApprovalSchema = z
  .object({
    reason: z.string().trim().min(1).max(MAX_DOCUMENT_APPROVAL_REASON_LENGTH),
  })
  .strict();

export type RejectDocumentApprovalInput = z.infer<typeof rejectDocumentApprovalSchema>;

const APPROVAL_QUEUE_MAX_LIMIT = 100;

const APPROVAL_QUEUE_DEFAULT_LIMIT = 25;

/**
 * The approval queue (US-E5-02). `assignedToMe` narrows to rounds the caller
 * is named on — the one filter the sidebar badge and the saved
 * "Awaiting my approval" view both run.
 *
 * Defaults to `true`: the queue is a personal work list, and a caller who
 * forgets the flag should get their own work rather than everybody's.
 */
export const listDocumentApprovalsQuerySchema = z.object({
  assignedToMe: z
    .enum(['true', 'false'])
    .transform((value) => value !== 'false')
    .default('true'),
  status: documentApprovalStatusSchema.optional(),
  overdueOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(APPROVAL_QUEUE_MAX_LIMIT)
    .default(APPROVAL_QUEUE_DEFAULT_LIMIT),
});

export type ListDocumentApprovalsQueryInput = z.infer<typeof listDocumentApprovalsQuerySchema>;

/**
 * How many rounds one bulk approval may carry (FR-E5-23).
 *
 * A cap rather than none: onboarding a 40-document corpus is the case this
 * exists for (R-18), and a request that could name ten thousand rounds would
 * be a way to hold a connection open while the database does an unbounded
 * amount of work. Fifty covers the real batch and keeps the request honest.
 */
export const MAX_BULK_DOCUMENT_APPROVALS = 50;

/**
 * Approve several rounds at once (FR-E5-23).
 *
 * Deliberately only *approve*. A rejection carries a reason that is specific
 * to the document (FR-E5-17), and a bulk rejection would either invent one
 * or paste the same sentence onto twenty different documents — which is the
 * rubber-stamping this feature exists to make visible, running in the
 * opposite direction.
 */
export const bulkApproveDocumentsSchema = z
  .object({
    requestIds: z
      .array(z.string().uuid())
      .min(1)
      .max(MAX_BULK_DOCUMENT_APPROVALS)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Each approval request may appear once',
      }),
  })
  .strict();

export type BulkApproveDocumentsInput = z.infer<typeof bulkApproveDocumentsSchema>;

/** Issuing a document whose type requires an approved round (FR-E5-11). */
export const DOCUMENT_APPROVAL_REQUIRED_ERROR_CODE = 'DOCUMENT_APPROVAL_REQUIRED';

/** Submitting one that is not a draft, or already has an open round. */
export const DOCUMENT_NOT_SUBMITTABLE_ERROR_CODE = 'DOCUMENT_NOT_SUBMITTABLE';

/**
 * The drafter named only themselves on a type whose `allowSelfApproval` is
 * off — refused at submit time rather than at approve time (§7.5.10), so the
 * drafter learns it while they can still fix the panel.
 */
export const DOCUMENT_SELF_APPROVAL_FORBIDDEN_ERROR_CODE = 'DOCUMENT_SELF_APPROVAL_FORBIDDEN';

/** A second decision on a round the first one already resolved (§7.5.10). */
export const DOCUMENT_APPROVAL_ALREADY_DECIDED_ERROR_CODE = 'DOCUMENT_APPROVAL_ALREADY_DECIDED';

/** A caller holding `decide` who is not on this round's panel (FR-E5-13). */
export const DOCUMENT_APPROVAL_NOT_AN_APPROVER_ERROR_CODE = 'DOCUMENT_APPROVAL_NOT_AN_APPROVER';

/** A panel naming an account that is not live staff — a patient, or nobody. */
export const DOCUMENT_APPROVER_INELIGIBLE_ERROR_CODE = 'DOCUMENT_APPROVER_INELIGIBLE';
