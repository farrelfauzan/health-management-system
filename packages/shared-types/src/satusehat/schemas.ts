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
