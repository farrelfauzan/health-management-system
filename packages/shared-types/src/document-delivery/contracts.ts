import type {
  ConsentRevokedReasonValue,
  DeliveryChannelValue,
  DeliveryPasswordSourceValue,
  DeliveryRefusalReasonValue,
  DeliveryShapeValue,
  DeliveryStatusValue,
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

/** The staff member who asked for a send, as the timeline shows them. */
export type DeliveryRequestedByView = {
  id: string;
  email: string;
};

/**
 * The token's state on a LINK delivery (FR-E4-11) — never the token. The
 * timeline shows whether it still resolves and how often it was opened.
 */
export type DeliveryLinkView = {
  expiresAt: string;
  revokedAt: string | null;
  openCount: number;
  lastOpenedAt: string | null;
};

/**
 * One row of the delivery timeline (`P16-T25`, FR-E4-14): what was sent, on
 * which channel, to which masked destination, by whom, and where it stands.
 * `passwordSource` names the scheme the attachment was locked with so a
 * cashier can tell the patient how to open it — it is never the password.
 */
export type DeliveryView = {
  id: string;
  patientId: string;
  invoiceId: string | null;
  documentId: string | null;
  channel: DeliveryChannelValue;
  shape: DeliveryShapeValue;
  destinationMasked: string;
  status: DeliveryStatusValue;
  attemptCount: number;
  sendAt: string | null;
  passwordSource: DeliveryPasswordSourceValue | null;
  lastError: string | null;
  sentAt: string | null;
  openedAt: string | null;
  revokedAt: string | null;
  requestedBy: DeliveryRequestedByView | null;
  link: DeliveryLinkView | null;
  createdAt: string;
  updatedAt: string;
};

/** `GET /invoices/:id/deliveries`, newest first. */
export type InvoiceDeliveryTimelineView = {
  invoiceId: string;
  deliveries: DeliveryView[];
};

/**
 * What the public link route hands a browser (FR-E4-11): a short-lived
 * presigned GET with attachment disposition, and the name to save it as.
 * The token is not the storage key and the storage key is not in here.
 */
export type DeliveryLinkResolutionView = {
  url: string;
  fileName: string;
  expiresAt: string;
};
