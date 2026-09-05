import type { InvoiceStatusValue } from '#billing/schemas';
import type {
  ConsentRevokedReasonValue,
  DeliveryChannelValue,
  DeliveryPasswordSourceValue,
  DeliveryRefusalReasonValue,
  DeliveryShapeValue,
  DeliveryStatusValue,
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

/**
 * Where an allowed send goes: the verified WhatsApp link's JID, or the email
 * on the patient record. Resolved at send time, never stored on the delivery
 * row (FR-E4-10).
 */
export type DeliveryDestination =
  | { channel: 'WHATSAPP'; externalChatId: string; phoneNumber: string }
  | { channel: 'EMAIL'; email: string };

/**
 * `destination` is set only when the send is allowed — a caller holding a
 * destination for a refused send is a caller one bug away from using it.
 */
export type DeliveryConsentCheckResult = {
  isAllowed: boolean;
  refusalReason: DeliveryRefusalReasonValue | null;
  destination: DeliveryDestination | null;
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
  /** How long a LINK delivery's token resolves (FR-E4-11; default 7 days). */
  readonly linkTtlHours: number;
  /** The web origin a delivery link lands on — `<base>/inv/<token>`. */
  readonly webAppBaseUrl: string;
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

/** The token's row as the repository projects it — never the token. */
export type DeliveryLinkRecord = {
  id: string;
  deliveryId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  openCount: number;
  lastOpenedAt: Date | null;
};

/** A delivery row as the repository projects it (`P16-T25`). */
export type DeliveryRecord = {
  id: string;
  patientId: string;
  invoiceId: string | null;
  invoiceDocumentId: string | null;
  documentId: string | null;
  channel: DeliveryChannelValue;
  shape: DeliveryShapeValue;
  destinationMasked: string;
  status: DeliveryStatusValue;
  attemptCount: number;
  sendAt: Date | null;
  nextAttemptAt: Date | null;
  leasedUntil: Date | null;
  leasedBy: string | null;
  passwordSource: DeliveryPasswordSourceValue | null;
  providerMessageId: string | null;
  lastError: string | null;
  sentAt: Date | null;
  openedAt: Date | null;
  revokedAt: Date | null;
  requestedBy: { id: string; email: string } | null;
  link: DeliveryLinkRecord | null;
  createdAt: Date;
  updatedAt: Date;
};

/** One QUEUED row per channel, written when a cashier asks for a send. */
export type CreateDeliveryData = {
  patientId: string;
  invoiceId: string | null;
  invoiceDocumentId: string | null;
  documentId: string | null;
  channel: DeliveryChannelValue;
  shape: DeliveryShapeValue;
  destinationMasked: string;
  passwordSource: DeliveryPasswordSourceValue | null;
  requestedById: string | null;
  sendAt: Date | null;
};

/** The hash and the expiry — the token itself goes to the message, not here. */
export type CreateDeliveryLinkData = {
  deliveryId: string;
  tokenHash: string;
  expiresAt: Date;
};

/** What the send pipeline puts in the message: the URL and its expiry. */
export type MintedDeliveryLink = {
  url: string;
  expiresAt: Date;
};

/**
 * Everything the public route needs to decide whether a token still opens
 * something (FR-E4-11, FR-E4-20): the link, its delivery, and the state of
 * the bill behind it. `storageKey` is read here and turned into a presigned
 * URL in the service; it never reaches the response.
 */
export type DeliveryLinkLookupRecord = {
  link: DeliveryLinkRecord;
  delivery: {
    id: string;
    patientId: string;
    status: DeliveryStatusValue;
  };
  invoice: { id: string; invoiceNumber: string; status: InvoiceStatusValue } | null;
  storageKey: string | null;
};

/** The one act the link route records: a successful open. */
export type RecordDeliveryLinkOpenData = {
  linkId: string;
  deliveryId: string;
  openedAt: Date;
};

/** One counter the public link route checks: a key and its per-minute limit. */
export type PublicLinkRateLimitRequest = {
  key: string;
  limit: number;
};
