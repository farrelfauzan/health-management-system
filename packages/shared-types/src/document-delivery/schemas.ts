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

/**
 * How a delivered document reaches the patient (`P16-T25`, FR-E4-05).
 * Mirrors the Prisma `DeliveryShape` enum. `ATTACHMENT` is the default on
 * both channels and always a password-protected PDF (D-027); `LINK` mints a
 * revocable, expiring token instead.
 */
export const DELIVERY_SHAPES = ['ATTACHMENT', 'LINK'] as const;

export const deliveryShapeSchema = z.enum(DELIVERY_SHAPES);

export type DeliveryShapeValue = z.infer<typeof deliveryShapeSchema>;

export const DEFAULT_DELIVERY_SHAPE: DeliveryShapeValue = 'ATTACHMENT';

/**
 * Where one delivery is in its life (`P16-T25`, FR-E4-12). Mirrors the Prisma
 * `DeliveryStatus` enum; see the schema comment for what each state means.
 */
export const DELIVERY_STATUSES = [
  'QUEUED',
  'SENT',
  'DELIVERED',
  'OPENED',
  'FAILED',
  'REVOKED',
  'CANCELLED',
] as const;

export const deliveryStatusSchema = z.enum(DELIVERY_STATUSES);

export type DeliveryStatusValue = z.infer<typeof deliveryStatusSchema>;

/**
 * Send a rendered invoice to the patient (`P16-T25`, FR-E4-01): one request,
 * one or both channels, one delivery row per channel.
 *
 * `shape` is a per-request override of the attachment default (FR-E4-05).
 * There is no destination field on purpose — the number or address is
 * whatever the verified link or the patient record says at send time, and a
 * request that could name one would be a request that could name the wrong
 * one.
 */
export const requestInvoiceDeliverySchema = z.object({
  channels: z
    .array(deliveryChannelSchema)
    .min(1, 'Pick at least one channel')
    .max(DELIVERY_CHANNELS.length)
    .refine((channels) => new Set(channels).size === channels.length, {
      message: 'Each channel may appear once',
    }),
  shape: deliveryShapeSchema.optional(),
  /**
   * Scheduled delivery (`P16-T38`, FR-E4-09): when the send is due. Absent
   * means now. The worker re-checks consent, the number and the invoice at
   * that moment, not at this one (FR-E4-10).
   */
  sendAt: z.string().datetime({ offset: true }).optional(),
});

export type RequestInvoiceDeliveryInput = z.infer<typeof requestInvoiceDeliverySchema>;

/** Move a queued send to another time (`P16-T38`). */
export const rescheduleDeliverySchema = z.object({
  sendAt: z.string().datetime({ offset: true }),
});

export type RescheduleDeliveryInput = z.infer<typeof rescheduleDeliverySchema>;

/**
 * A delivery-link token as it appears in the URL: 32 bytes from the CSPRNG,
 * base64url, 43 characters, no padding. Anything else is refused before the
 * database is asked, so a scan of the route learns nothing from timing.
 */
export const DELIVERY_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const deliveryLinkTokenSchema = z.string().regex(DELIVERY_LINK_TOKEN_PATTERN);
