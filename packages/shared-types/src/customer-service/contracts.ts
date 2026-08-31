import type {
  ChannelDraftMissingFieldValue,
  ChannelKindValue,
  ConversationMessageRoleValue,
  ConversationStateValue,
  ProspectiveMatchReasonValue,
  ProspectivePatientStatusValue,
  WaGatewayKindValue,
} from '#customer-service/schemas';
import type { ChannelArrivalSubjectKind } from '#customer-service/types';

/**
 * One conversation as the admin inbox lists it (`PCS-T08`, §4.2).
 *
 * **No message bodies.** A list screen renders dozens of rows at a time, and a
 * preview line would put post-redaction customer text into every response an
 * admin's browser caches, every screenshot of the queue, and every log of a
 * list request — for a conversation nobody opened. The transcript is one click
 * away and is where reading is an act rather than a side effect.
 *
 * `senderDisplayName` is whatever the channel offered and is never identity
 * (§4.1). It exists so the queue shows something other than a number.
 */
export type AdminConversationView = {
  id: string;
  channel: ChannelKindValue;
  externalChatId: string;
  senderDisplayName: string | null;
  state: ConversationStateValue;
  isBlocked: boolean;
  blockedAt: string | null;
  /**
   * How long the customer has been waiting, in whole seconds, for a
   * conversation in `NEEDS_HUMAN`; null in every other state. Computed here
   * rather than left to the client because the queue sorts on it and two
   * clients with different clocks would sort it differently.
   */
  waitingForSeconds: number | null;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
};

export type AdminConversationListView = {
  items: AdminConversationView[];
  nextCursor: string | null;
};

/**
 * The handoff queue's notification affordance (§4.2 acceptance criterion).
 *
 * Counts rather than rows, because this is polled to drive a nav badge and a
 * poll that returns conversations would fetch the whole queue every interval
 * to render one number. `oldestWaitingSince` is what turns the badge from a
 * count into a priority: three conversations waiting two minutes and one
 * waiting forty are very different afternoons.
 */
export type ConversationHandoffSummaryView = {
  needsHumanCount: number;
  humanActiveCount: number;
  oldestWaitingSince: string | null;
};

/**
 * One transcript turn as an admin reads it.
 *
 * `authorEmail` is resolved from the user row at read time rather than copied
 * onto the message, so an account that changes address is not shown under two
 * identities across one conversation. It is null on every non-`ADMIN` role,
 * because nobody wrote them — and the email is what this codebase has: `User`
 * carries no display name, and inventing one from the local part would put a
 * guess in a transcript that is read as evidence.
 *
 * `safetyTags` are surfaced deliberately: an admin taking over a conversation
 * needs to see that the previous turn was an emergency escalation or a
 * redaction, and a transcript that renders those as ordinary text hides the
 * single most important thing about the exchange.
 */
export type AdminConversationMessageView = {
  id: string;
  role: ConversationMessageRoleValue;
  content: string;
  authorUserId: string | null;
  authorEmail: string | null;
  safetyTags: string[];
  createdAt: string;
};

/**
 * A transcript page, newest-first with a cursor onto older turns.
 *
 * Newest-first because that is the page an admin always wants — the reason
 * they opened the conversation is the last thing said in it — and because a
 * cursor over an oldest-first list would have to count the whole conversation
 * to find the end.
 */
export type AdminConversationTranscriptView = {
  conversation: AdminConversationView;
  items: AdminConversationMessageView[];
  nextCursor: string | null;
};

/**
 * One channel-sourced booking waiting at the counter (§5.2).
 *
 * The three `patient*` fields are what make it a worklist rather than a list:
 * `patientIsDraft` says the record was created by a chat and has never been
 * seen by a human, and `missingFields` names exactly what the front desk has
 * to ask for. Both are computed here because "incomplete" is a rule about the
 * columns `PCS-T07` made nullable, and a client re-deriving it would drift.
 *
 * There is no identifier here, masked or otherwise. The desk is looking at the
 * person; a worklist that carried NIK digits would put them in a screen that
 * is open all day on a counter monitor.
 */
export type ChannelArrivalView = {
  appointmentId: string;
  bookingReferenceCode: string | null;
  channel: ChannelKindValue;
  scheduledAt: string;
  appointmentStatus: string;
  doctorName: string;
  specialty: string | null;
  subjectKind: ChannelArrivalSubjectKind;
  /** Null for a prospective record — no MRN has been spent on that person. */
  patientId: string | null;
  patientMrn: string | null;
  /** Null for a legacy draft profile. */
  prospectivePatientId: string | null;
  patientFullName: string;
  patientPhoneNumber: string;
  /**
   * True when this row cannot be registered as it stands — a legacy draft
   * missing required columns, or any prospective record, which is missing all
   * of them by definition.
   */
  patientIsDraft: boolean;
  /**
   * Column names from the draft that a human still has to supply.
   *
   * A closed set rather than free text: the front-desk screen renders a label
   * per entry, and an unrecognised value would render as nothing at all — the
   * one failure mode that looks exactly like a complete record.
   */
  missingFields: ChannelDraftMissingFieldValue[];
  createdAt: string;
};

export type ChannelArrivalListView = {
  items: ChannelArrivalView[];
  nextCursor: string | null;
};

/**
 * What a draft merge moved (§5.2).
 *
 * Counts rather than a bare acknowledgement, because the admin who pressed
 * the button is about to check the person in and needs to know the booking
 * actually followed. A merge that moved zero appointments is a merge of the
 * wrong record, and silence would let it pass.
 */
export type ChannelDraftMergeView = {
  draftPatientId: string;
  targetPatientId: string;
  movedAppointments: number;
  movedRegistrations: number;
  movedChannelLinks: number;
};

/**
 * One record a draft could be merged into (§5.2).
 *
 * Five fields, and the selection is the point: a name alone is not enough to
 * merge on — two people called Siti is the ordinary case, not the edge one —
 * so the MRN, the registered number, and the date of birth are here because
 * they are what a person at a counter checks against the card in their hand.
 *
 * No identifier value, masked or otherwise. Confirming a NIK is what the
 * patient-edit screen is for, behind its own audited grant.
 */
export type ChannelMergeCandidateView = {
  id: string;
  mrn: string;
  fullName: string;
  phoneNumber: string;
  dateOfBirth: string | null;
};

/**
 * Whether the clinic's WhatsApp session is alive (`PCS-T09`, §8.4).
 *
 * §8.4 names a silently logged-out WhatsApp session as the channel's number
 * one operational failure mode, and the reason it is *silent* is that nothing
 * fails: the bridge keeps answering, the API keeps accepting bookings, and
 * every reply is simply never delivered. This is the shape that makes it
 * visible.
 *
 * The three booleans are separate on purpose because they fail in different
 * ways and want different responses. `isConfigured` false means nobody set the
 * gateway up; `isConnected` false means the bridge cannot reach WhatsApp,
 * which usually resolves itself; `isLoggedIn` false is the one that needs a
 * person with the clinic's phone, because it means the pairing is gone and
 * only a QR scan brings it back.
 */
export type WhatsappSessionHealth = {
  kind: WaGatewayKindValue;
  isConfigured: boolean;
  isConnected: boolean;
  isLoggedIn: boolean;
  /** When this was read. A stale card is worse than no card. */
  checkedAt: string;
};

/**
 * A pairing session started for a re-auth (§8.4).
 *
 * `qrLink` points at the **bridge**, on the private network, and is not
 * proxied through HMS. Fetching the image and re-serving it would put a live
 * pairing credential in an HMS response and its caches — and a WhatsApp
 * pairing code grants the session outright, so it is the one secret that must
 * not travel further than it has to.
 */
export type WhatsappPairingSessionView = {
  qrLink: string;
  expiresInSeconds: number | null;
};

/**
 * The Telegram webhook's registration health (§8.4).
 *
 * Telegram's own `getWebhookInfo` is the source of every field here, because
 * the only authority on what Telegram will do with the clinic's bot is
 * Telegram. What this shape adds is the two comparisons a raw reading does not
 * make, and both exist because of failure modes that are otherwise invisible.
 *
 * **`isMatching` is the one worth building the card for.** A bot token has
 * exactly one webhook, globally — not one per environment. So a staging
 * deployment registering with production's token does not produce an error
 * anywhere: it silently takes the traffic, and production goes quiet with a
 * healthy-looking configuration. Comparing the registered url against the one
 * this deployment would register is the only way that shows up.
 *
 * **`isLastErrorStale` exists because Telegram's error field is sticky.**
 * `lastErrorMessage` holds the last failure forever and is never cleared by a
 * successful delivery — only overwritten by the next failure. Read without a
 * clock it looks like a live outage, and an operator who reacts to a
 * three-hour-old 401 is chasing a fault that fixed itself.
 *
 * `registeredUrl` is a public path and carries nothing secret. The bot token
 * and the webhook secret never appear in this shape and must not: the card
 * shows where Telegram is pointed, never what authenticates it.
 */
export type TelegramWebhookHealth = {
  /** Both the bot token and the webhook secret are present in the environment. */
  isConfigured: boolean;
  /** Whether the channel's master switch is on. Configured but paused is not broken. */
  isChannelEnabled: boolean;
  /** What Telegram currently holds. Null means no webhook is registered at all. */
  registeredUrl: string | null;
  /** What this deployment would register, built from its own public base url. */
  expectedUrl: string | null;
  isMatching: boolean;
  /** Updates Telegram is holding because delivery is failing. */
  pendingUpdateCount: number;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  /** Whether that error predates the most recent successful delivery window. */
  isLastErrorStale: boolean;
  /** When this was read. A stale card is worse than no card. */
  checkedAt: string;
};

/**
 * §8.4's channel metrics, over a window (`PCS-T11`).
 *
 * The five §8.4 names, and they exist to make the `PCS-T11` go/no-go decision
 * read numbers instead of impressions. Each answers a question somebody
 * actually asks before announcing a WhatsApp number:
 *
 * - `messagesPerDay` — is anyone using it, and is the volume what we expected?
 * - `intentMix` — is the tool loop routing, or is every turn a bare chat?
 * - `bookingConversion` — does the channel do the thing it was built for?
 * - `handoffRate` — how much human time does it *cost* rather than save?
 * - `faqNoHitRate` — the corpus-improvement signal: questions the clinic's
 *   documents could not answer are the next documents to write.
 *
 * Counts and ratios only. No message text, no chat ids, no patient names — a
 * dashboard is the surface most likely to be screenshotted into a group chat,
 * and none of these numbers is worth less for being anonymous.
 */
export type ChannelMetricsView = {
  /** Inclusive ISO dates the window covers, in the clinic timezone. */
  from: string;
  to: string;
  windowDays: number;
  inboundMessages: number;
  /** Inbound customer messages divided by days in the window. */
  messagesPerDay: number;
  conversationsStarted: number;
  /**
   * How often each tool was actually called. An empty map with real traffic
   * means the model is answering everything from the system prompt, which is
   * the failure §6 warns about — it looks like a working bot and cites
   * nothing.
   */
  intentMix: Readonly<Record<string, number>>;
  bookingsConfirmed: number;
  /** Bookings divided by conversations started, 0–1. */
  bookingConversion: number;
  handoffs: number;
  /** Handoffs divided by conversations started, 0–1. */
  handoffRate: number;
  faqSearches: number;
  faqNoHits: number;
  /** No-hits divided by FAQ searches, 0–1. Null when nothing was searched. */
  faqNoHitRate: number | null;
  /** §8.3 counters, so a spent budget is visible next to the traffic. */
  rateLimitedTurns: number;
  budgetExhaustedTurns: number;
  enumerationFlags: number;
  blockedConversations: number;
};

/**
 * One person who has asked to become a patient and has not arrived yet
 * (`P17-T04`).
 *
 * Carries no MRN and no clinical field, because there are none — that is what
 * makes this row a prospective record rather than a patient. `expiresAt` is on
 * it so the desk can see that an enquiry from three months ago is about to
 * stop being kept, rather than discovering it vanished.
 */
export type ProspectivePatientView = {
  id: string;
  fullName: string;
  phoneNumber: string;
  channel: ChannelKindValue;
  status: ProspectivePatientStatusValue;
  /** Set once the record resolved — the patient it became, or was found to be. */
  patientId: string | null;
  /** How many bookings are still riding on this record. */
  openAppointments: number;
  expiresAt: string;
  createdAt: string;
};

/**
 * A registry record the person at the counter might already be (`P17-T04`).
 *
 * `score` orders the list and `reasons` explains it; the clerk acts on the
 * reasons. A candidate offered on `NAME_SIMILAR` alone is a prompt to keep
 * looking at the ID document, not a record to link — and presenting it with
 * the same weight as an exact NIK hit is how a booking ends up on a stranger's
 * chart.
 *
 * `nikMasked` shows only the last four digits, and only so the clerk can check
 * them against the card. The plaintext NIK stays behind
 * `patient.read-identifier` on the patient-edit screen, where reading one is
 * an audited act rather than a side effect of searching.
 */
export type ProspectiveMatchCandidateView = {
  id: string;
  mrn: string;
  fullName: string;
  phoneNumber: string;
  dateOfBirth: string | null;
  nikMasked: string | null;
  score: number;
  reasons: ProspectiveMatchReasonValue[];
};

/**
 * What resolving a prospective record did (`P17-T04`).
 *
 * `resolution` is the field worth reading: `CONVERTED` means an MRN was just
 * spent on a new record, `LINKED` means one already existed and none was. The
 * counts are here for the same reason the merge view carries them — the clerk
 * is about to check this person in, and a resolution that moved zero bookings
 * resolved the wrong record.
 */
export type ProspectiveArrivalResolutionView = {
  prospectivePatientId: string;
  resolution: Extract<ProspectivePatientStatusValue, 'CONVERTED' | 'LINKED'>;
  patientId: string;
  /** Allocated by the conversion; pre-existing on a link. */
  mrn: string;
  patientFullName: string;
  movedAppointments: number;
};
