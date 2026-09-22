import type {
  DeliveryConsentGrantedByView,
  DeliveryConsentNoticeVersionView,
} from '#document-delivery/contracts';
import type { ConsentRevokedReasonValue } from '#document-delivery/schemas';

/**
 * The patient's visit-reminder consent (P25-T17, D-042). `null` on the
 * response means she was never asked, which is not the same as having said
 * no — and neither sends anything.
 */
export type VisitReminderConsentView = {
  purpose: 'VISIT_REMINDER';
  isGranted: boolean;
  noticeVersion: DeliveryConsentNoticeVersionView | null;
  grantedAt: string | null;
  grantedBy: DeliveryConsentGrantedByView | null;
  revokedAt: string | null;
  /** `PATIENT_KEYWORD` when she replied STOP / BERHENTI; `STAFF` at the counter. */
  revokedReason: ConsentRevokedReasonValue | null;
};

/** `GET` / `PUT /patients/:patientId/visit-reminder-consent`. */
export type PatientVisitReminderConsentResponse = {
  patientId: string;
  consent: VisitReminderConsentView | null;
};
