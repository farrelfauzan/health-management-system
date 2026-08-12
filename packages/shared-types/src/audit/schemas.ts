import { z } from 'zod';

export const auditTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime());

/**
 * Filters for the audit access-history query (SJ-4).
 *
 * Every filter is optional, but the endpoint is not a browsable feed: results
 * are ordered newest-first and capped, and the realistic uses are "everything
 * that touched this patient" and "everything this actor did", which is what
 * the `(patient_id, occurred_at)` and `(actor_user_id, occurred_at)` indexes
 * serve. An unfiltered page is still allowed because an incident review starts
 * before you know which name to type.
 */
export const listAuditEventsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    patientId: z.string().uuid().optional(),
    actorUserId: z.string().uuid().optional(),
    resource: z.string().trim().min(1).max(64).optional(),
    action: z.string().trim().min(1).max(64).optional(),
    requestId: z.string().trim().min(1).max(128).optional(),
    occurredFrom: auditTimestampSchema.optional(),
    occurredTo: auditTimestampSchema.optional(),
  })
  .refine(
    (query) =>
      !query.occurredFrom ||
      !query.occurredTo ||
      new Date(query.occurredFrom) <= new Date(query.occurredTo),
    { message: 'occurredFrom must be earlier than or equal to occurredTo' },
  );

export type ListAuditEventsQueryInput = z.infer<typeof listAuditEventsQuerySchema>;
