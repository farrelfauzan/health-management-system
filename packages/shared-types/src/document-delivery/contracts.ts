import type {
  ConsentRevokedReasonValue,
  DeliveryChannelValue,
  DeliveryRefusalReasonValue,
} from '#document-delivery/schemas';

/** The clerk who captured a consent, as the record shows them. */
export type DeliveryConsentGrantedByView = {
  id: string;
  email: string;
};

/** The notice version that was in force when consent was captured. */
export type DeliveryConsentNoticeVersionView = {
  id: string;
  version: string;
};

/**
 * One channel's consent row, or `null` when the patient has never been asked
 * (`P16-T24`, FR-E4-04). Absent and withdrawn are different facts and are
 * shown differently — one is a form to fill in, the other a decision to
 * respect.
 */
export type PatientDeliveryConsentView = {
  channel: DeliveryChannelValue;
  isGranted: boolean;
  noticeVersion: DeliveryConsentNoticeVersionView | null;
  grantedAt: string | null;
  grantedBy: DeliveryConsentGrantedByView | null;
  revokedAt: string | null;
  revokedReason: ConsentRevokedReasonValue | null;
};

/**
 * Whether one channel can carry a document to this patient right now, and if
 * not, why (FR-E4-03/04). This is what the send dialog (`P16-T27`) reads to
 * disable a channel with its reason; the backend gate re-evaluates it at send
 * time regardless.
 */
export type DeliveryChannelReadinessView = {
  channel: DeliveryChannelValue;
  consent: PatientDeliveryConsentView | null;
  isDeliveryAllowed: boolean;
  refusalReason: DeliveryRefusalReasonValue | null;
};

/** `GET /patients/:patientId/delivery-consents`. */
export type PatientDeliveryConsentsView = {
  patientId: string;
  channels: DeliveryChannelReadinessView[];
};
