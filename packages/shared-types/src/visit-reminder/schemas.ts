import { z } from 'zod';

/**
 * The single purpose this consent covers (P25-T17, D-042). Recorded on the
 * row so the consent reads for what it is even out of context: WhatsApp
 * reminders of due maternal visits, and nothing else — not document delivery,
 * which has its own consent under `PatientDeliveryConsent`.
 */
export const VISIT_REMINDER_CONSENT_PURPOSE = 'VISIT_REMINDER' as const;

/**
 * Capture or withdraw visit-reminder consent at the counter. Like delivery
 * consent, the notice version is read server-side and never taken from the
 * request: the patient agreed to what was in force when the clerk asked.
 */
export const upsertVisitReminderConsentSchema = z.object({
  isGranted: z.boolean(),
});

export type UpsertVisitReminderConsentInput = z.infer<typeof upsertVisitReminderConsentSchema>;

/**
 * Where one reminder stands. `PENDING` is the claim the worker writes before
 * it sends — the unique `(patient, visit key)` is what makes a second send
 * impossible — and it settles to `SENT` or `FAILED`.
 */
export const MATERNAL_VISIT_REMINDER_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;

export const maternalVisitReminderStatusSchema = z.enum(MATERNAL_VISIT_REMINDER_STATUSES);

export type MaternalVisitReminderStatusValue = z.infer<typeof maternalVisitReminderStatusSchema>;
