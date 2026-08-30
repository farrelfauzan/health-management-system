import {
  ChannelDraftMissingFieldValue,
  ChannelKindValue,
  ChannelVerificationMethodValue,
  ChannelVerificationStatusValue,
  ConversationMessageRoleValue,
  ConversationStateValue,
  CsSafetyTagValue,
  ProspectivePatientStatusValue,
  WaGatewayKindValue,
} from '#customer-service/schemas';

/**
 * One inbound customer message, normalized off whichever wire it arrived on
 * (customer-service strategy §4.1).
 *
 * Everything downstream of the gateway is channel-blind, and this type is why.
 * A WhatsApp JID and a Telegram chat id are both `externalChatId`; a GOWA
 * webhook body and a Telegram `Update` both reduce to these six fields. The
 * conversation state machine, the tool loop, and the transcript never learn
 * which gateway delivered a message, which is what makes swapping WhatsApp
 * gateways — or adding the official Cloud API later — a change at the edge
 * rather than a change to business logic.
 */
export type InboundChannelMessage = {
  channel: ChannelKindValue;
  /** WhatsApp JID or Telegram chat id, as a string on both channels. */
  externalChatId: string;
  /**
   * The gateway's own id for this message, used for dedup.
   *
   * **Unique only within a chat, not globally**, on both channels: Telegram's
   * `message_id` counts up per conversation, so two customers trivially hold
   * the same one. The uniqueness constraint is therefore over
   * `(channel, externalChatId, externalMessageId)` — see the note on the
   * dedup table.
   */
  externalMessageId: string;
  /**
   * Whatever the channel offers as a human name, or null. Never trusted as
   * identity: a Telegram display name is chosen by its owner and a WhatsApp
   * push name is chosen by the sender. It exists so an admin reading a
   * handoff queue sees something other than a number.
   */
  senderDisplayName: string | null;
  text: string;
  /** ISO 8601, from the channel's own timestamp rather than arrival time. */
  receivedAt: string;
  /**
   * The contact card the customer shared, when the update carried one
   * (§5.1.1 tier 2). Absent on every ordinary text message, which is all this
   * channel sees outside a verification step.
   */
  sharedContact?: SharedContact;
};

/**
 * One outbound reply. The dispatcher picks an adapter from `channel`, so a
 * caller composes a message without knowing which gateway will carry it.
 */
export type OutboundChannelMessage = {
  channel: ChannelKindValue;
  externalChatId: string;
  text: string;
  /**
   * Ask the customer to share their own contact card alongside this message
   * (§5.1.1 tier 2). A *presentation* hint, not content: Telegram renders it
   * as a one-tap button, and a gateway with no equivalent affordance sends the
   * text alone — which is why §7 keeps the conversation core text-first and
   * lets the adapter decide how a request is shown.
   */
  requestContact?: boolean;
};

/**
 * What the gateway did with an inbound message, returned to the webhook so the
 * acknowledgement body says something true.
 *
 * `DUPLICATE` is a success, not an error: gateways retry webhooks, and a retry
 * being recognised and dropped is the dedup layer working. The distinction is
 * kept because the two have very different meanings in a log — a rising
 * `ACCEPTED` count is traffic, a rising `DUPLICATE` count is a gateway that
 * is not receiving our acknowledgements.
 */
export const INBOUND_MESSAGE_OUTCOMES = ['ACCEPTED', 'DUPLICATE', 'IGNORED', 'DISABLED'] as const;

export type InboundMessageOutcomeValue = (typeof INBOUND_MESSAGE_OUTCOMES)[number];

/** Gateway configuration resolved at startup (strategy §8.5). */
export type ChannelGatewayConfig = {
  /** Master switch, default off. With it off, no webhook does any work. */
  readonly isEnabled: boolean;
  /**
   * The deployment's own public origin, e.g. `https://klinik.example.id`.
   *
   * Read from `HMS_DOMAIN`, the variable the reverse proxy already terminates
   * TLS for, so the API and the proxy cannot disagree about what this
   * deployment is called. Empty on a deployment that has not set it, which
   * makes webhook registration unavailable rather than guessed at.
   *
   * It exists so the webhook url is **derived** rather than typed. The path is
   * a fact of this codebase, not an operator's decision, and an origin that
   * came from a form would turn the registration button into a way to point
   * the clinic's bot traffic at any host on the internet.
   */
  readonly publicBaseUrl: string;
  readonly telegram: {
    readonly botToken: string;
    /**
     * The value Telegram echoes in `X-Telegram-Bot-Api-Secret-Token`. Empty
     * means the Telegram channel is not configured, and its webhook refuses
     * every request rather than accepting unauthenticated ones.
     */
    readonly webhookSecret: string;
  };
  readonly whatsapp: WhatsappGatewayConfig;
};

/**
 * The self-hosted WhatsApp bridge's configuration (`PCS-T09`, §2.1, §8.1).
 *
 * Every field is a *private-network* fact. `baseUrl` names a container on the
 * API's own Docker network and must never be publicly resolvable: GOWA's REST
 * port drives a live WhatsApp session, so anyone who can reach it can send as
 * the clinic. The credentials are the second lock on that same door.
 */
export type WhatsappGatewayConfig = {
  readonly kind: WaGatewayKindValue;
  /** e.g. `http://gowa:3000`. Empty means no WhatsApp gateway is configured. */
  readonly baseUrl: string;
  /** GOWA's `APP_BASIC_AUTH` pair. Unused by WAHA, which takes a single key. */
  readonly basicAuthUsername: string;
  readonly basicAuthPassword: string;
  /**
   * WAHA's `X-Api-Key` (§8.5 `WA_GATEWAY_API_KEY`). A separate variable from
   * the basic-auth pair rather than one credential field serving both: they
   * are different secrets for different bridges, and a shared field would make
   * a failover a find-and-replace inside a value.
   */
  readonly apiKey: string;
  /**
   * WAHA's session name, default `default`. WAHA is multi-session by design
   * where GOWA is multi-device; one clinic uses one session, and the value is
   * configurable only so a shared WAHA host can serve more than one clinic.
   */
  readonly sessionName: string;
  /**
   * The HMAC key GOWA signs every webhook body with. Empty closes the
   * WhatsApp webhook rather than opening it, exactly as the Telegram secret
   * does — an unset value must never mean "accept anything".
   */
  readonly webhookSecret: string;
  /**
   * The clinic's own WhatsApp JID, e.g. `628123456789@s.whatsapp.net`. GOWA
   * scopes device-management calls by it, and §5.1.1 tier 1 compares against
   * the *sender's* JID rather than this one — this is the account doing the
   * sending, not the customer.
   */
  readonly deviceId: string;
  /**
   * Milliseconds to hold between consecutive outbound sends (§2.1 risk note,
   * §8.3). Human-like pacing is one of the named ban mitigations, and it is a
   * number rather than a boolean so a clinic warming a new number can slow it
   * further without a code change.
   */
  readonly sendPacingMs: number;
};

/**
 * One persisted conversation, as the service layer sees it.
 *
 * Carries no user id and must not until §5.1.1 verification supplies one:
 * `(channel, externalChatId)` *is* the customer as far as this channel knows.
 */
export type ConversationRecord = {
  id: string;
  channel: ChannelKindValue;
  externalChatId: string;
  senderDisplayName: string | null;
  state: ConversationStateValue;
  hasSentNotice: boolean;
  /**
   * When an admin blocked this chat (`PCS-T08`, §8.3), or null.
   *
   * On the record rather than only on the admin projection because the inbound
   * path is the one that has to honour it, and it must do so from the row it
   * already read — a second query per message to ask "is this chat blocked"
   * would put the abuse control's cost on the traffic it exists to stop.
   */
  blockedAt: string | null;
  lastMessageAt: string;
};

/** One transcript turn, already redacted. */
export type ConversationTurn = {
  role: ConversationMessageRoleValue;
  content: string;
};

/**
 * What the safety layer decided about one inbound message.
 *
 * `ANSWER_LOCALLY` is not a failure: the message is accepted and answered
 * from a template this codebase authored, without ever reaching a provider —
 * which is exactly what must happen for an emergency, where the right
 * response cannot depend on an upstream API being reachable.
 */
export type CsInputDecision =
  | { outcome: 'SEND_TO_MODEL'; content: string; safetyTags: CsSafetyTagValue[] }
  | {
      outcome: 'ANSWER_LOCALLY';
      content: string;
      safetyTags: CsSafetyTagValue[];
      replyContent: string;
      shouldHandOff: boolean;
    };

/** Customer-service channel configuration (strategy §6, §8.3, §8.5). */
export type CustomerServiceConfig = {
  /** How many prior turns are replayed to the provider. */
  readonly historyTurnLimit: number;
  /** Inbound messages allowed per chat per hour before the polite template. */
  readonly rateLimitPerChatHour: number;
  /**
   * §8.3's daily LLM budget, as a **clinic-wide** count of provider calls
   * (`PCS-T11`).
   *
   * A second cap alongside the per-chat one, and it is not redundant: the
   * per-chat limit bounds what one customer costs and does nothing about a
   * hundred chats, which on a public channel costs nothing to arrange. This is
   * the one that bounds the *bill*.
   *
   * Counted in calls rather than tokens deliberately. Tokens are the true
   * unit, but they are only known after a provider answers — a token budget
   * can only ever stop the call *after* the one that broke it, and it needs a
   * counter every adapter has to remember to update. A call count is knowable
   * before spending anything.
   */
  readonly maxLlmCallsPerDay: number;
  readonly clinicName: string;
  /** The booking and verification half (`PCS-T07`). */
  readonly booking: CustomerServiceBookingConfig;
};


/**
 * One prospective patient as the service layer sees it (`P17-T01`).
 *
 * A person who asked for an appointment through a messaging channel and has
 * never attended. Deliberately not a patient: no MRN has been spent on them,
 * no medical record exists, and the fields are exactly the two the chatbot is
 * allowed to collect.
 */
export type ProspectivePatientRecord = {
  id: string;
  fullName: string;
  /** Already normalised by `normalizePhoneNumber` — never the raw input. */
  phoneNumber: string;
  channel: ChannelKindValue;
  externalChatId: string | null;
  status: ProspectivePatientStatusValue;
  patientId: string | null;
  convertedAt: string | null;
  convertedById: string | null;
  expiresAt: string;
  createdAt: string;
};

/** What the chat booking path supplies to open a prospective record. */
export type CreateProspectivePatientParams = {
  fullName: string;
  /** Must already be normalised; the repository does not normalise for you. */
  phoneNumber: string;
  channel: ChannelKindValue;
  externalChatId: string | null;
  /** Computed from `prospectivePatientRetentionDays` by the caller that owns the clock. */
  expiresAt: Date;
};

/** What the counter supplies when an arrival resolves to a patient. */
export type ResolveProspectivePatientParams = {
  prospectivePatientId: string;
  patientId: string;
  /** The front-desk user who resolved it. */
  convertedById: string;
  convertedAt: Date;
};

/** What redaction did to one message body. */
export type RedactCustomerMessageResult = {
  content: string;
  wasRedacted: boolean;
};

/**
 * A Telegram contact card the customer tapped to share (§5.1.1 tier 2).
 *
 * Present only when the update carried one, and it is the one piece of
 * inbound data on this channel that *is* evidence of identity: the Bot API
 * only fills `contact.user_id` with the sharer's own account when they used
 * the `request_contact` button, so a number arriving this way was verified by
 * Telegram rather than typed by whoever holds the phone.
 */
export type SharedContact = {
  /** Digits as Telegram supplied them; normalised before any comparison. */
  phoneNumber: string;
  /**
   * True only when the card is the sender's own account. A customer can also
   * forward *somebody else's* contact from their address book, and that proves
   * nothing at all — it must never be treated as possession.
   */
  isSelfShared: boolean;
};

/**
 * Configuration of the booking and verification half of the channel
 * (strategy §5.1.1, §8.3, §8.5).
 */
export type CustomerServiceBookingConfig = {
  /** §8.5 `CS_OTP_TTL_SECONDS`, default 300. */
  readonly otpTtlSeconds: number;
  /** §8.5 `CS_OTP_MAX_ATTEMPTS`, default 3. */
  readonly otpMaxAttempts: number;
  /** §8.3's "max 3 challenges per chat per day". */
  readonly otpMaxChallengesPerDay: number;
  /** §8.5 `CS_LINK_REVERIFY_DAYS`, default 180. */
  readonly linkReverifyDays: number;
  /**
   * How many *distinct chats* may fail a possession challenge against one
   * patient record in a day before the conversation is flagged for review
   * (`PCS-T11`, §8.3).
   *
   * Counted across chats, because the per-chat challenge quota above bounds
   * one conversation and a second chat resets it for free.
   */
  readonly enumerationChatThreshold: number;
  /** §8.3's per-number cap on active future bookings. */
  readonly maxActiveBookingsPerPhone: number;
  /** §8.3's clinic-wide daily cap on bookings for numbers matching no record. */
  readonly maxDraftBookingsPerDay: number;
  /**
   * `CS_PROSPECTIVE_PATIENT_RETENTION_DAYS`, default 90 — how long an
   * unresolved {@link ProspectivePatientRecord} is kept (`P17-T01`).
   *
   * This is **not** an RME retention period and the 25-year PMK 24/2022 floor
   * must never be applied to it. The row is a booking enquiry holding a name
   * and a phone number for somebody who was never a patient, so what governs
   * it is UU PDP 27/2022, and 90 days is the shape that takes: long enough for
   * a booking made well ahead plus two reschedules, short enough that the
   * clinic is not holding a list of strangers' phone numbers indefinitely.
   *
   * A record that resolved to a patient is past this date and stays — it is
   * the provenance of that patient's first contact, and it is what makes a
   * repeat booking from the same number find them again.
   */
  readonly prospectivePatientRetentionDays: number;
};

/**
 * What one chat has claimed and how far it has proved it (§5.1).
 */
export type ChannelPatientLinkRecord = {
  id: string;
  channel: ChannelKindValue;
  externalChatId: string;
  phoneNumber: string;
  fullName: string;
  patientId: string | null;
  verificationStatus: ChannelVerificationStatusValue;
  verifiedAt: string | null;
};

/**
 * The booking a possession challenge is holding open, so the customer does not
 * have to retype their choice after verifying.
 */
export type PendingChannelBooking = {
  patientFullName: string;
  phoneNumber: string;
  doctorId: string;
  scheduleId: string;
  /** ISO calendar date, clinic timezone. */
  sessionDate: string;
  note: string | null;
};

/** One live possession challenge as the service layer sees it. */
export type ChannelOtpChallengeRecord = {
  id: string;
  conversationId: string;
  method: ChannelVerificationMethodValue;
  patientId: string;
  attemptsUsed: number;
  expiresAt: string;
  pendingBooking: PendingChannelBooking;
};

/**
 * How an inbound message was resolved while a conversation sits in
 * `AWAITING_OTP` (§5.1.1).
 *
 * Every value here is produced by a string comparison and a clock, never by a
 * model — which is what makes "prompt injection cannot talk its way past
 * verification" true rather than hoped for.
 */
export type ChannelOtpVerificationOutcome =
  | { outcome: 'VERIFIED' }
  | { outcome: 'WRONG_CODE'; attemptsRemaining: number }
  | { outcome: 'EXHAUSTED' }
  | { outcome: 'EXPIRED' }
  | { outcome: 'NO_CHALLENGE' };

/**
 * A session as the channel addresses it.
 *
 * Sessions are materialised lazily (revamp §3.2) — a window nobody has booked
 * yet has no row and therefore no id — so the channel cannot address one by
 * primary key. This triple is what a booking actually needs, and the opaque
 * `sessionId` the tools pass around is exactly its encoding.
 */
export type ChannelSessionReference = {
  doctorId: string;
  scheduleId: string;
  /** ISO calendar date in the clinic timezone. */
  sessionDate: string;
};

/**
 * A conversation row as the admin repository projects it (`PCS-T08`).
 *
 * Wider than {@link ConversationRecord}, which the runtime state machine uses:
 * the inbox needs the block columns and a message count that the message path
 * has no reason to pay for on every inbound turn.
 */
export type AdminConversationRecord = {
  id: string;
  channel: ChannelKindValue;
  externalChatId: string;
  senderDisplayName: string | null;
  state: ConversationStateValue;
  blockedAt: string | null;
  blockedById: string | null;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
};

/** What the inbox query filters and pages on. */
export type ListAdminConversationsParams = {
  states?: readonly ConversationStateValue[];
  channel?: ChannelKindValue;
  /** True lists only blocked chats, false only unblocked, undefined both. */
  isBlocked?: boolean;
  search?: string;
  cursor?: string;
  limit: number;
};

/** One transcript row with its author already joined. */
export type AdminConversationMessageRecord = {
  id: string;
  role: ConversationMessageRoleValue;
  content: string;
  authorUserId: string | null;
  authorEmail: string | null;
  safetyTags: string[];
  createdAt: string;
};

/** The two counts and the clock behind the handoff badge. */
export type ConversationHandoffCounts = {
  needsHumanCount: number;
  humanActiveCount: number;
  oldestWaitingSince: string | null;
};


/** What the arrival worklist query filters and pages on. */
export type ListChannelArrivalsParams = {
  /** Inclusive clinic-local calendar dates. */
  from: string;
  to: string;
  channel?: ChannelKindValue;
  referenceCode?: string;
  cursor?: string;
  limit: number;
};

/** One arrival row as the repository projects it, before completeness is judged. */
export type ChannelArrivalRecord = {
  appointmentId: string;
  bookingReferenceCode: string | null;
  channel: ChannelKindValue;
  scheduledAt: string;
  appointmentStatus: string;
  doctorName: string;
  specialty: string | null;
  patientId: string;
  patientMrn: string;
  patientFullName: string;
  patientPhoneNumber: string;
  patientSource: 'FRONT_DESK' | 'CHANNEL_BOOKING';
  missingFields: ChannelDraftMissingFieldValue[];
  createdAt: string;
};

/** What a draft merge moved, as the transaction reports it. */
export type ChannelDraftMergeResult = {
  movedAppointments: number;
  movedRegistrations: number;
  movedChannelLinks: number;
};

/** What the merge-candidate lookup filters and caps on. */
export type ListChannelMergeCandidatesParams = {
  search: string;
  limit: number;
};
