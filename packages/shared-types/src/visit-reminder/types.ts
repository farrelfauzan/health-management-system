import type { ConsentRevokedReasonValue } from '#document-delivery/schemas';
import type { MaternalVisitReminderStatusValue } from '#visit-reminder/schemas';

/** One visit-reminder consent row as the repository projects it. */
export type VisitReminderConsentRecord = {
  patientId: string;
  isGranted: boolean;
  noticeVersion: { id: string; version: string } | null;
  grantedAt: Date | null;
  grantedBy: { id: string; email: string; name: string } | null;
  revokedAt: Date | null;
  revokedReason: ConsentRevokedReasonValue | null;
};

/** Capture at the counter: the notice in force and the clerk doing it. */
export type GrantVisitReminderConsentData = {
  patientId: string;
  noticeVersionId: string | null;
  grantedById: string;
  grantedAt: Date;
};

/** Withdrawal, by the counter or by the patient's own keyword. */
export type RevokeVisitReminderConsentData = {
  patientId: string;
  revokedReason: ConsentRevokedReasonValue;
  revokedAt: Date;
};

/**
 * A consenting patient with the contact fields the verified-number gate reads
 * — the same shape as `DeliveryGatePatientRecord`, so the gate is asked
 * exactly as the delivery pipeline asks it.
 */
export type VisitReminderRecipientRecord = {
  id: string;
  phoneNumber: string;
  email: string | null;
};

/** The one reminder row a `(patient, visit key)` may ever have. */
export type MaternalVisitReminderRecord = {
  id: string;
  patientId: string;
  visitKey: string;
  status: MaternalVisitReminderStatusValue;
  attemptedAt: Date;
};

/** What the worker writes before it sends. */
export type ClaimMaternalVisitReminderData = {
  patientId: string;
  visitKey: string;
  source: string;
  dueFrom: Date;
  attemptedAt: Date;
};
