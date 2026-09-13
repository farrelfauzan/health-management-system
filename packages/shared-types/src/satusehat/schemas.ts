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
 * Which SATUSEHAT platform a deployment is actually talking to (P21-T06).
 *
 * `SANDBOX` is the public staging platform every vendor shares. Data sent there
 * reaches no real patient: a green SUBMITTED row proves the integration works
 * and proves nothing to the person whose visit it was. `PRODUCTION` is the real
 * national record, which is what SATUSEHAT Mobile reads.
 *
 * `UNKNOWN` is for a base URL that is neither — a proxy, a mock, a future
 * regional endpoint. It is deliberately not folded into `SANDBOX`: telling an
 * operator "sandbox" about a host we do not recognise would be a guess
 * presented as a fact, and the one thing this value exists to prevent is a
 * confident wrong answer about where the data went.
 */
export const SATUSEHAT_ENVIRONMENTS = ['SANDBOX', 'PRODUCTION', 'UNKNOWN'] as const;

export const satusehatEnvironmentSchema = z.enum(SATUSEHAT_ENVIRONMENTS);

export type SatusehatEnvironmentValue = z.infer<typeof satusehatEnvironmentSchema>;
