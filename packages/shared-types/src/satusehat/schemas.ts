import { z } from 'zod';

export const SATUSEHAT_SUBMISSION_STATUSES = ['PENDING', 'SUBMITTED', 'FAILED'] as const;

export const satusehatSubmissionStatusSchema = z.enum(SATUSEHAT_SUBMISSION_STATUSES);

export type SatusehatSubmissionStatusValue = z.infer<typeof satusehatSubmissionStatusSchema>;

/**
 * Which chain a row reports (P18-T09). ENCOUNTER is the visit bundle written
 * when an encounter closes; LAB_REPORT is the
 * ServiceRequest/Specimen/Observation/DiagnosticReport chain written when a
 * lab order is released.
 */
export const SATUSEHAT_SUBMISSION_KINDS = ['ENCOUNTER', 'LAB_REPORT'] as const;

export const satusehatSubmissionKindSchema = z.enum(SATUSEHAT_SUBMISSION_KINDS);

export type SatusehatSubmissionKindValue = z.infer<typeof satusehatSubmissionKindSchema>;

/**
 * Whether one item of a submission reached the national record (P21-T02).
 * SKIPPED does not mean the submission failed: the bundle went, and this item
 * was deliberately left out of it.
 */
export const SATUSEHAT_RESOURCE_OUTCOMES = ['SENT', 'SKIPPED'] as const;

export const satusehatResourceOutcomeSchema = z.enum(SATUSEHAT_RESOURCE_OUTCOMES);

export type SatusehatResourceOutcomeValue = z.infer<typeof satusehatResourceOutcomeSchema>;

/**
 * Why an item was left out of a bundle. Every value is a *category*, never the
 * item itself, because this list is readable by an administrator: under D-033
 * they may learn that two medications were skipped for want of a code, but not
 * which medications, since a medication name says what the patient was
 * prescribed.
 *
 * Every value is a catalog gap a clinic can close by coding a row, except
 * `NO_VERIFIED_RESULT`, which is bench work nobody has signed off yet.
 *
 * A resource whose id could not be paired out of the transaction response is
 * **not** in this list: it was sent, so it is recorded as SENT with a null
 * `satusehatId`. Calling that a skip would claim the national record lacks
 * something it holds.
 */
export const SATUSEHAT_RESOURCE_SKIP_REASONS = [
  'NO_KFA_CODE',
  'NO_ICD9CM_CODE',
  'NO_LOINC_CODE',
  'NO_VERIFIED_RESULT',
  'UNCODED_COMPOUND_COMPONENT',
] as const;

export const satusehatResourceSkipReasonSchema = z.enum(SATUSEHAT_RESOURCE_SKIP_REASONS);

export type SatusehatResourceSkipReasonValue = z.infer<typeof satusehatResourceSkipReasonSchema>;

export const listSatusehatSubmissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: satusehatSubmissionStatusSchema.optional(),
  kind: satusehatSubmissionKindSchema.optional(),
  encounterId: z.string().uuid().optional(),
  labOrderId: z.string().uuid().optional(),
});

export type ListSatusehatSubmissionsQueryInput = z.infer<
  typeof listSatusehatSubmissionsQuerySchema
>;

/**
 * What a read-back of one resource found on SATUSEHAT (P21-T03).
 *
 * `NOT_FOUND` is keyed on the platform's **HTTP 404**, never on its body: the
 * `OperationOutcome` returned there says `code: "no-store"` and
 * `details.text: "storage_error"`, and neither string says "not found"
 * (P21-T01). `ERROR` is anything else — a timeout, an open circuit, an
 * unauthorised call — and is deliberately distinct from `NOT_FOUND`, because
 * "SATUSEHAT does not hold this" and "we could not ask" mean opposite things to
 * an operator deciding whether to resend.
 *
 * `UNPAIRED` is for a resource that was sent but whose id we never resolved, so
 * there is nothing to read back. It is not an error: the resource is on the
 * platform, we simply cannot name it.
 */
export const SATUSEHAT_RESOURCE_CHECK_OUTCOMES = [
  'FOUND',
  'NOT_FOUND',
  'UNPAIRED',
  'ERROR',
] as const;

export const satusehatResourceCheckOutcomeSchema = z.enum(SATUSEHAT_RESOURCE_CHECK_OUTCOMES);

export type SatusehatResourceCheckOutcomeValue = z.infer<
  typeof satusehatResourceCheckOutcomeSchema
>;
