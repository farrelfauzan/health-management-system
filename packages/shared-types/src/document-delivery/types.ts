import type {
  ConsentRevokedReasonValue,
  DeliveryChannelValue,
  DeliveryPasswordSourceValue,
  DeliveryRefusalReasonValue,
} from '#document-delivery/schemas';

/** A consent row as the repository projects it. */
export type PatientDeliveryConsentRecord = {
  id: string;
  patientId: string;
  channel: DeliveryChannelValue;
  isGranted: boolean;
  noticeVersion: { id: string; version: string } | null;
  grantedAt: Date | null;
  grantedBy: { id: string; email: string } | null;
  revokedAt: Date | null;
  revokedReason: ConsentRevokedReasonValue | null;
};

/** Capture at the counter: the notice in force and the clerk doing it. */
export type GrantDeliveryConsentData = {
  patientId: string;
  channel: DeliveryChannelValue;
  noticeVersionId: string | null;
  grantedById: string;
  grantedAt: Date;
};

/** Withdrawal, by the counter or by the patient's own keyword. */
export type RevokeDeliveryConsentData = {
  patientId: string;
  channel: DeliveryChannelValue;
  revokedReason: ConsentRevokedReasonValue;
  revokedAt: Date;
};

/** The one question the delivery pipeline asks (`P16-T25`/`T26`). */
export type DeliveryConsentCheckInput = {
  patientId: string;
  channel: DeliveryChannelValue;
};

export type DeliveryConsentCheckResult = {
  isAllowed: boolean;
  refusalReason: DeliveryRefusalReasonValue | null;
};

/**
 * What the WhatsApp gate needs from the patient record and the link table to
 * decide (FR-E4-03). Only the fields the decision reads — the gate is not a
 * patient read.
 */
export type DeliveryGatePatientRecord = {
  id: string;
  phoneNumber: string;
  email: string | null;
};

/**
 * A `ChannelPatientLink` as the gate sees it: which patient it is proven for
 * (if any), and whether the proof has happened.
 */
export type DeliveryGateChannelLinkRecord = {
  id: string;
  externalChatId: string;
  phoneNumber: string;
  patientId: string | null;
  isVerified: boolean;
};

/**
 * The WhatsApp gate's answer. `link` is the row a send would address — set
 * only when the channel is open, because a caller holding a link for a
 * refused send is a caller one bug away from using it.
 */
export type WhatsappDeliveryGateResult = {
  isAllowed: boolean;
  refusalReason: DeliveryRefusalReasonValue | null;
  link: DeliveryGateChannelLinkRecord | null;
};

/**
 * Delivery configuration resolved from the environment at boot (`P16-T37`).
 *
 * `passwordSource` is per deployment — which, on the single-tenant build, is
 * per clinic (FR-E4-06). A clinic wanting stronger protection than a date of
 * birth changes this, not code.
 */
export type DocumentDeliveryConfig = {
  readonly passwordSource: DeliveryPasswordSourceValue;
};

/**
 * What a protected attachment carries back to the delivery pipeline: the
 * encrypted bytes and the *scheme* the password came from — never the
 * password, which is recomputed at send time and stored nowhere (FR-E4-06).
 */
export type ProtectedDeliveryDocument = {
  readonly content: Uint8Array;
  readonly passwordSource: DeliveryPasswordSourceValue;
};

/**
 * The fields the password resolver reads from a patient record. `dateOfBirth`
 * is typed nullable even though the column is `NOT NULL` since `P17-T05`:
 * FR-E4-07's refusal is the resolver's job, and a type that could not express
 * the missing case could not test it.
 */
export type DeliveryPasswordPatientRecord = {
  id: string;
  mrn: string;
  dateOfBirth: Date | null;
};
