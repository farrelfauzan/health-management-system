import { z } from 'zod';

/**
 * Which channels a document can be delivered on (`P16-T24`, PRD §7.4).
 * Mirrors the Prisma `DeliveryChannel` enum.
 */
export const DELIVERY_CHANNELS = ['WHATSAPP', 'EMAIL'] as const;

export const deliveryChannelSchema = z.enum(DELIVERY_CHANNELS);

export type DeliveryChannelValue = z.infer<typeof deliveryChannelSchema>;

/**
 * Why a consent row is no longer granted. Two different facts about consent:
 * `PATIENT_KEYWORD` is the patient's own act (`STOP` / `BERHENTI` on
 * WhatsApp, FR-E4-16), `STAFF` is a withdrawal at the counter.
 */
export const CONSENT_REVOKED_REASONS = ['PATIENT_KEYWORD', 'STAFF'] as const;

export const consentRevokedReasonSchema = z.enum(CONSENT_REVOKED_REASONS);

export type ConsentRevokedReasonValue = z.infer<typeof consentRevokedReasonSchema>;

/**
 * Capture or withdraw one channel's consent at the counter (FR-E4-04).
 *
 * The notice version is deliberately *not* a request field: consent is
 * recorded against whichever notice is in force at capture time, and letting
 * the client name one would let it record consent against a notice the
 * patient was never shown.
 */
export const upsertPatientDeliveryConsentSchema = z.object({
  channel: deliveryChannelSchema,
  isGranted: z.boolean(),
});

export type UpsertPatientDeliveryConsentInput = z.infer<typeof upsertPatientDeliveryConsentSchema>;

/**
 * Why a channel cannot be used for this patient right now (FR-E4-03/04).
 *
 * Distinct on purpose: the send surface offers a different next step for each
 * — capture consent, run the OTP flow, complete the email — and a single
 * "not available" would hide which one.
 */
export const DELIVERY_REFUSAL_REASONS = [
  /** No consent row for this channel. Deny by default. */
  'CONSENT_MISSING',
  /** The row exists and `isGranted` is false; see `revokedReason`. */
  'CONSENT_REVOKED',
  /** No `ChannelPatientLink` claims this patient's number. */
  'NUMBER_NOT_LINKED',
  /** A link claims the number but no possession proof has succeeded. */
  'NUMBER_UNVERIFIED',
  /**
   * The number is verified — for somebody else. The send is refused and the
   * attempt audited, because this is the one refusal that is evidence.
   */
  'NUMBER_VERIFIED_FOR_ANOTHER_PATIENT',
  /** The patient record has no email address. */
  'EMAIL_MISSING',
] as const;

export const deliveryRefusalReasonSchema = z.enum(DELIVERY_REFUSAL_REASONS);

export type DeliveryRefusalReasonValue = z.infer<typeof deliveryRefusalReasonSchema>;

/**
 * How an attachment's password is derived (`P16-T37`, FR-E4-06).
 *
 * The value is a *scheme*, never a password: it is what the delivery row
 * records so support can tell a patient how to open a file, and what the
 * message describes without disclosing (FR-E4-08). `DOB_DDMMYYYY` is the
 * default because it is something the patient knows without being told and a
 * stranger holding a misdialled number does not.
 */
export const DELIVERY_PASSWORD_SOURCES = ['DOB_DDMMYYYY', 'DOB_YYYYMMDD', 'MRN'] as const;

export const deliveryPasswordSourceSchema = z.enum(DELIVERY_PASSWORD_SOURCES);

export type DeliveryPasswordSourceValue = z.infer<typeof deliveryPasswordSourceSchema>;

export const DEFAULT_DELIVERY_PASSWORD_SOURCE: DeliveryPasswordSourceValue = 'DOB_DDMMYYYY';
