import type {
  ChannelDraftMissingFieldValue,
  ChannelKindValue,
  ConversationMessageRoleValue,
  ConversationStateValue,
  WaGatewayKindValue,
} from '#customer-service/schemas';

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
  patientId: string;
  patientMrn: string;
  patientFullName: string;
  patientPhoneNumber: string;
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
