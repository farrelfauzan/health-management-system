import { z } from 'zod';

import { createPatientSchema, nikSchema } from '#patient-management/schemas';

/**
 * The messaging channels the customer-service gateway speaks. Mirrors the
 * Prisma `ChannelKind` enum.
 *
 * `TELEGRAM` ships first as the pilot (D-CS-05): free, official, and no ban
 * risk, so every conversational flow can be exercised end to end before a real
 * WhatsApp number is exposed.
 */
export const CHANNEL_KINDS = ['WHATSAPP', 'TELEGRAM'] as const;

export const channelKindSchema = z.enum(CHANNEL_KINDS);

export type ChannelKindValue = z.infer<typeof channelKindSchema>;

/**
 * Where a prospective patient's booking ended up (`P17-T01`). Mirrors the
 * Prisma `ProspectivePatientStatus` enum.
 *
 * `CONVERTED` and `LINKED` are both "this person is now a patient", and they
 * are kept apart because the answer to *which* matters at the counter:
 * `CONVERTED` allocated an MRN, `LINKED` found one that already existed. A
 * single `RESOLVED` value would hide the only number worth watching here --
 * how often the clinic creates a second record for somebody it already knew.
 */
export const PROSPECTIVE_PATIENT_STATUSES = [
  'AWAITING_ARRIVAL',
  'CONVERTED',
  'LINKED',
  'EXPIRED',
] as const;

export const prospectivePatientStatusSchema = z.enum(PROSPECTIVE_PATIENT_STATUSES);

export type ProspectivePatientStatusValue = z.infer<typeof prospectivePatientStatusSchema>;

/**
 * The longest inbound message body the gateway will carry.
 *
 * Telegram caps a text message at 4096 characters, so anything longer is not a
 * message this channel could have produced. The cap is enforced here rather
 * than trusted from the wire because the body is attacker-controlled and every
 * downstream consumer — dedup rows, transcripts, and eventually a prompt —
 * pays for its length.
 */
export const INBOUND_MESSAGE_MAX_LENGTH = 4096;

/**
 * The slice of a Telegram `Update` this gateway accepts.
 *
 * **Deliberately not the full Bot API type.** grammY ships complete typings,
 * and using them here would mean every field Telegram has ever added is in
 * scope for a webhook that only ever reads five of them. Parsing to a narrow
 * shape at the edge is what keeps "the gateway is a dumb pipe" true of the
 * data as well as the code: an update carrying a photo, a poll, an inline
 * query, or an edited message fails this schema and is acknowledged and
 * dropped rather than half-understood.
 *
 * `passthrough` is **not** used, so unknown keys are stripped rather than
 * carried forward into anything that persists them.
 */
export const telegramMessageSenderSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

export type TelegramMessageSenderInput = z.infer<typeof telegramMessageSenderSchema>;

/**
 * The contact card produced by tapping a `request_contact` button (§5.1.1
 * tier 2).
 *
 * `user_id` is the field that carries the meaning. Telegram fills it with the
 * Telegram account the card belongs to, so a card whose `user_id` equals the
 * sender's own id is a number Telegram itself verified for that account —
 * evidence of possession. A card forwarded from the sender's address book
 * arrives through the same field with somebody else's id, or none, and proves
 * nothing.
 */
export const telegramContactSchema = z.object({
  phone_number: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  user_id: z.number().int().optional(),
});

export type TelegramContactInput = z.infer<typeof telegramContactSchema>;

export const telegramWebhookUpdateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      message_id: z.number().int(),
      date: z.number().int(),
      chat: z.object({
        id: z.number().int(),
        // Group and channel chats are out of scope for v1: the conversation
        // model is one customer per chat, and a group would attribute several
        // people's messages to one conversation.
        type: z.string(),
      }),
      from: telegramMessageSenderSchema.optional(),
      text: z.string().optional(),
      contact: telegramContactSchema.optional(),
    })
    .optional(),
});

export type TelegramWebhookUpdateInput = z.infer<typeof telegramWebhookUpdateSchema>;

/**
 * Where a conversation is in its lifecycle (strategy §4.2). Mirrors the
 * Prisma `ConversationState` enum.
 *
 * The set exists to answer one question on every inbound message: **may the
 * LLM see this?** Only `BOT_ACTIVE` says yes.
 */
export const CONVERSATION_STATES = [
  'BOT_ACTIVE',
  'NEEDS_HUMAN',
  'HUMAN_ACTIVE',
  'AWAITING_OTP',
  'ARCHIVED',
] as const;

export const conversationStateSchema = z.enum(CONVERSATION_STATES);

export type ConversationStateValue = z.infer<typeof conversationStateSchema>;

/**
 * The states in which an inbound message is persisted but **never sent to a
 * provider**. Derived from the list rather than written as a branch, so a
 * state added later must be classified deliberately instead of defaulting
 * into the half that reaches the model.
 */
export const LLM_PAUSED_CONVERSATION_STATES = [
  'NEEDS_HUMAN',
  'HUMAN_ACTIVE',
  'AWAITING_OTP',
  'ARCHIVED',
] as const satisfies readonly ConversationStateValue[];

export const CONVERSATION_MESSAGE_ROLES = ['CUSTOMER', 'BOT', 'ADMIN', 'SYSTEM'] as const;

export const conversationMessageRoleSchema = z.enum(CONVERSATION_MESSAGE_ROLES);

export type ConversationMessageRoleValue = z.infer<typeof conversationMessageRoleSchema>;

/**
 * What a guard did to a turn, recorded on the persisted row so the §8.4
 * review can count what was actually caught rather than trusting it was
 * never needed.
 */
export const CS_SAFETY_TAGS = [
  'sensitive_data_redacted',
  'prompt_injection_blocked',
  'emergency_escalation',
  'medical_question_referred',
  'handoff_requested',
  'rate_limited',
  /**
   * §8.3's clinic-wide daily LLM budget was spent (`PCS-T11`). Distinct from
   * `rate_limited`, which is one customer sending too fast: this one means
   * *every* customer is getting a template, and an operator counting these
   * is looking at a different incident.
   */
  'daily_budget_exhausted',
  /**
   * Repeated failed possession challenges have targeted the same patient
   * record from more than one chat (`PCS-T11`, §8.3) — what enumeration of
   * the registry looks like from the inside. The conversation is flagged for
   * a human rather than blocked, because the same pattern is also what a
   * confused family produces sharing one number.
   */
  'enumeration_suspected',
  'provider_unavailable',
  /**
   * A tool-call turn (`PCS-T07`). Also the marker that keeps these rows out of
   * the replay window: what a lookup returned is already reflected in the
   * reply, and replaying its JSON on every later turn would spend the token
   * budget re-reading answers the model has already given.
   */
  'tool_invocation',
] as const;

export type CsSafetyTagValue = (typeof CS_SAFETY_TAGS)[number];

/**
 * The complete tool surface of the public channel (`PCS-T07`, strategy §4.2).
 *
 * **That this list has three entries is itself the security boundary.** There
 * is no tool that reads a patient record, an appointment history, a bill, or
 * an identifier — so no prompt injection can ask for one, and the question
 * "what could a hostile message reach?" is answered by reading three names
 * rather than by auditing a prompt.
 */
export const CS_TOOL_NAMES = ['search_faq', 'list_available_sessions', 'book_appointment'] as const;

export const csToolNameSchema = z.enum(CS_TOOL_NAMES);

export type CsToolNameValue = z.infer<typeof csToolNameSchema>;

/** Longest FAQ question accepted, well under the inbound message cap. */
export const CS_FAQ_QUERY_MAX_LENGTH = 300;

export const searchFaqArgumentsSchema = z.object({
  query: z
    .string()
    .trim()
    .min(3)
    .max(CS_FAQ_QUERY_MAX_LENGTH)
    .describe('Pertanyaan pelanggan tentang layanan klinik, dalam bahasa aslinya.'),
});

export type SearchFaqArgumentsInput = z.infer<typeof searchFaqArgumentsSchema>;

/**
 * The `search_faq` allowlist: passage text and the title of the document it
 * came from, and nothing else.
 *
 * The retrieval score is the omission worth naming. It is a number, and a
 * model handed a number will present it to a customer as a confidence
 * percentage — an invented one, since a reciprocal-rank score is not a
 * probability of anything.
 */
export const searchFaqResultSchema = z.object({
  passages: z.array(
    z.object({
      documentTitle: z.string(),
      content: z.string(),
    }),
  ),
});

export type SearchFaqResult = z.infer<typeof searchFaqResultSchema>;

/**
 * How far ahead the channel will look (§4.2). Fourteen days rather than the
 * 92 the staff calendar allows: a chat customer asking "kapan dokter praktik?"
 * wants this week, and a three-month answer is both unreadable on a phone and
 * a much larger extract of the clinic's roster to hand an anonymous caller.
 */
export const CS_SESSION_RANGE_MAX_DAYS = 14;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus dalam format YYYY-MM-DD');

export const listAvailableSessionsArgumentsSchema = z
  .object({
    poliOrDoctorName: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .optional()
      .describe('Nama dokter atau poli yang diminta pelanggan. Kosongkan jika tidak disebut.'),
    dateFrom: isoDateSchema.describe('Tanggal awal pencarian (YYYY-MM-DD).'),
    dateTo: isoDateSchema.describe('Tanggal akhir pencarian (YYYY-MM-DD), maksimal 14 hari.'),
  })
  .refine((value) => value.dateFrom <= value.dateTo, {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateTo'],
  })
  .refine((value) => countInclusiveDays(value.dateFrom, value.dateTo) <= CS_SESSION_RANGE_MAX_DAYS, {
    message: `Range must not exceed ${CS_SESSION_RANGE_MAX_DAYS} days`,
    path: ['dateTo'],
  });

export type ListAvailableSessionsArgumentsInput = z.infer<
  typeof listAvailableSessionsArgumentsSchema
>;

/**
 * Inclusive day count between two ISO dates. Written against UTC midnights
 * rather than local time so a clinic whose timezone crosses a DST boundary
 * cannot make a 14-day range parse as 15.
 */
function countInclusiveDays(fromDate: string, toDate: string): number {
  const MILLISECONDS_PER_DAY = 86_400_000;
  const from = Date.parse(`${fromDate}T00:00:00.000Z`);
  const to = Date.parse(`${toDate}T00:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.round((to - from) / MILLISECONDS_PER_DAY) + 1;
}

/**
 * The `list_available_sessions` allowlist (§4.2): who practises, when the
 * window is, and whether there is room. **No attendee data** — not a count of
 * who booked by name, not a queue position, not a patient id. The clinic's
 * capacity is operational information; who is in the room is not.
 *
 * `sessionId` is opaque on purpose. It is the token `book_appointment` accepts
 * back, and making it meaningless to the model is what stops a booking from
 * being assembled out of guessed identifiers.
 */
export const listAvailableSessionsResultSchema = z.object({
  sessions: z.array(
    z.object({
      sessionId: z.string(),
      doctorName: z.string(),
      specialty: z.string(),
      sessionDate: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      /** Null means the session has no attendance cap, not "unknown". */
      remaining: z.number().int().nullable(),
      isFull: z.boolean(),
    }),
  ),
});

export type ListAvailableSessionsResult = z.infer<typeof listAvailableSessionsResultSchema>;

/** Schema cap from §4.2 — a note, not a medical history. */
export const CS_BOOKING_NOTE_MAX_LENGTH = 200;

/**
 * `book_appointment` (D-CS-03).
 *
 * **Read this schema for what it does not have.** There is no `nik`, no
 * `bpjsNumber`, no `dateOfBirth`, no `address`, and no field a complaint could
 * be typed into beyond a 200-character note. The system prompt also says not
 * to ask for those — but a prompt is a request and this is a wall: even a
 * model that decided to collect a NIK would have nowhere to put it, and the
 * redaction layer would already have removed it from the turn.
 */
export const bookAppointmentArgumentsSchema = z.object({
  patientFullName: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .describe('Nama lengkap pasien seperti yang pelanggan tuliskan.'),
  phoneNumber: z
    .string()
    .trim()
    .min(6)
    .max(32)
    .describe('Nomor telepon yang bisa dihubungi, seperti yang pelanggan tuliskan.'),
  sessionId: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe('Nilai sessionId persis seperti yang dikembalikan list_available_sessions.'),
  note: z
    .string()
    .trim()
    .max(CS_BOOKING_NOTE_MAX_LENGTH)
    .optional()
    .describe('Catatan singkat opsional. Jangan pernah isi dengan data medis atau nomor identitas.'),
});

export type BookAppointmentArgumentsInput = z.infer<typeof bookAppointmentArgumentsSchema>;

/**
 * Why a booking could not be made, as a closed set.
 *
 * Closed because the model composes the customer-facing sentence from it, and
 * a free-text reason is a channel through which a backing service's error
 * message — table names, ids, another patient's data in a constraint
 * violation — reaches a stranger on WhatsApp.
 */
export const CS_BOOKING_REJECTION_REASONS = [
  'SESSION_NOT_FOUND',
  'SESSION_FULL',
  'SESSION_CLOSED',
  'BOOKING_CUTOFF_PASSED',
  'ALREADY_BOOKED',
  'TOO_MANY_ACTIVE_BOOKINGS',
  'DAILY_BOOKING_LIMIT_REACHED',
  'TEMPORARILY_UNAVAILABLE',
] as const;

export const csBookingRejectionReasonSchema = z.enum(CS_BOOKING_REJECTION_REASONS);

export type CsBookingRejectionReasonValue = z.infer<typeof csBookingRejectionReasonSchema>;

/**
 * The `book_appointment` allowlist (§4.2).
 *
 * Three shapes, and the boundaries between them matter more than the fields:
 *
 * - `CONFIRMED` carries the reference code, the doctor, and the window —
 *   **never a queue position**, because the session model assigns those at
 *   check-in and a promised number is a promise the clinic cannot keep. It is
 *   also byte-identical in shape whether the booking attached to a real
 *   patient record or created a draft, which is §5.1.1's no-registry-oracle
 *   rule made structural: there is no field in which "we found you" could be
 *   said.
 * - `VERIFICATION_REQUIRED` says a possession challenge is now outstanding and
 *   carries nothing about whose record prompted it.
 * - `REJECTED` carries a reason from the closed set above.
 */
export const bookAppointmentResultSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('CONFIRMED'),
    referenceCode: z.string(),
    doctorName: z.string(),
    specialty: z.string(),
    sessionDate: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    arrivalInstruction: z.string(),
  }),
  z.object({
    outcome: z.literal('VERIFICATION_REQUIRED'),
  }),
  z.object({
    outcome: z.literal('REJECTED'),
    reason: csBookingRejectionReasonSchema,
  }),
]);

export type BookAppointmentResult = z.infer<typeof bookAppointmentResultSchema>;

/**
 * How firmly a chat is tied to the patient record it claims (§5.1.1,
 * D-CS-08). Mirrors the Prisma `ChannelVerificationStatus` enum.
 */
export const CHANNEL_VERIFICATION_STATUSES = [
  'UNVERIFIED',
  'CHANNEL_VERIFIED',
  'OTP_VERIFIED',
] as const;

export const channelVerificationStatusSchema = z.enum(CHANNEL_VERIFICATION_STATUSES);

export type ChannelVerificationStatusValue = z.infer<typeof channelVerificationStatusSchema>;

/**
 * The statuses that permit a booking to attach to an existing patient record.
 * Derived from the list rather than written as `!== 'UNVERIFIED'` so a status
 * added later has to be classified deliberately instead of defaulting into the
 * half that grants linkage.
 */
/**
 * Which of §5.1.1's proofs a challenge is waiting for. Mirrors the Prisma
 * `ChannelVerificationMethod` enum.
 */
export const CHANNEL_VERIFICATION_METHODS = ['CONTACT_SHARE', 'OTP'] as const;

export const channelVerificationMethodSchema = z.enum(CHANNEL_VERIFICATION_METHODS);

export type ChannelVerificationMethodValue = z.infer<typeof channelVerificationMethodSchema>;

export const LINKABLE_VERIFICATION_STATUSES = [
  'CHANNEL_VERIFIED',
  'OTP_VERIFIED',
] as const satisfies readonly ChannelVerificationStatusValue[];

/**
 * How the admin inbox slices the conversation list (`PCS-T08`, §4.2).
 *
 * `HANDOFF` is not a state — it is `NEEDS_HUMAN` plus `HUMAN_ACTIVE`, the two
 * halves of "a person owns this conversation". It exists as its own filter
 * because that is the queue an admin works from, and asking them to hold two
 * checkboxes to see it would make the screen's primary job its least obvious
 * one. `BLOCKED` is likewise not a state (§8.3 blocks are a policy overlay on
 * whatever state the chat was in), so it cannot be expressed as one either.
 */
export const CONVERSATION_INBOX_FILTERS = [
  'ALL',
  'HANDOFF',
  'NEEDS_HUMAN',
  'HUMAN_ACTIVE',
  'BOT_ACTIVE',
  'AWAITING_OTP',
  'ARCHIVED',
  'BLOCKED',
] as const;

export const conversationInboxFilterSchema = z.enum(CONVERSATION_INBOX_FILTERS);

export type ConversationInboxFilterValue = z.infer<typeof conversationInboxFilterSchema>;

export const CONVERSATION_PAGE_DEFAULT_LIMIT = 25;
export const CONVERSATION_PAGE_MAX_LIMIT = 100;

export const listConversationsQuerySchema = z.object({
  filter: conversationInboxFilterSchema.default('ALL'),
  channel: channelKindSchema.optional(),
  /**
   * Matches the display name or the external chat id. Not the transcript:
   * searching message bodies would make every §5.3 redaction decision moot by
   * building an index over the text it was protecting.
   */
  search: z.string().trim().min(2).max(120).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CONVERSATION_PAGE_MAX_LIMIT)
    .default(CONVERSATION_PAGE_DEFAULT_LIMIT),
});

export type ListConversationsQueryInput = z.infer<typeof listConversationsQuerySchema>;

export const CONVERSATION_TRANSCRIPT_DEFAULT_LIMIT = 50;
export const CONVERSATION_TRANSCRIPT_MAX_LIMIT = 200;

export const listConversationTranscriptQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CONVERSATION_TRANSCRIPT_MAX_LIMIT)
    .default(CONVERSATION_TRANSCRIPT_DEFAULT_LIMIT),
});

export type ListConversationTranscriptQueryInput = z.infer<
  typeof listConversationTranscriptQuerySchema
>;

/**
 * The longest reply an admin can send. Telegram's own limit is 4096, and the
 * WhatsApp gateways are higher, so the tighter number is the one that is true
 * on every channel — a reply that silently fails to send on one of them is
 * worse than one refused in the composer.
 */
export const ADMIN_REPLY_MAX_LENGTH = 4000;

export const replyToConversationSchema = z.object({
  text: z.string().trim().min(1).max(ADMIN_REPLY_MAX_LENGTH),
});

export type ReplyToConversationInput = z.infer<typeof replyToConversationSchema>;

/** §8.3's chat block. The reason is for the audit trail, never sent anywhere. */
export const CS_BLOCK_REASON_MAX_LENGTH = 300;

export const blockConversationSchema = z.object({
  reason: z.string().trim().min(3).max(CS_BLOCK_REASON_MAX_LENGTH).optional(),
});

export type BlockConversationInput = z.infer<typeof blockConversationSchema>;

/**
 * The arrival worklist's window (§5.2).
 *
 * Defaults to today, because the worklist is a check-in-desk screen and the
 * question it answers is "who is walking in with an incomplete record". The
 * range is bounded so a mistyped date cannot ask for the whole channel history
 * at a counter.
 */
export const CHANNEL_ARRIVAL_RANGE_MAX_DAYS = 31;

const arrivalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus dalam format YYYY-MM-DD');

export const listChannelArrivalsQuerySchema = z
  .object({
    from: arrivalDateSchema.optional(),
    to: arrivalDateSchema.optional(),
    channel: channelKindSchema.optional(),
    /**
     * The reference code from the confirmation reply — what a customer reads
     * out at the counter, and therefore the only search term the desk has
     * before it has identified the person.
     */
    referenceCode: z.string().trim().min(3).max(32).optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(CONVERSATION_PAGE_MAX_LIMIT)
      .default(CONVERSATION_PAGE_DEFAULT_LIMIT),
  })
  .refine((value) => value.from === undefined || value.to === undefined || value.from <= value.to, {
    message: 'from must be on or before to',
    path: ['to'],
  });

export type ListChannelArrivalsQueryInput = z.infer<typeof listChannelArrivalsQuerySchema>;

/**
 * Merges a chat-created draft into the patient record it should have been
 * (§5.2 — the phone match was wrong, or verification never happened).
 *
 * Only the two ids. There is deliberately no "and also update these fields"
 * half: completing a record is the existing patient-edit screen, with its own
 * validation and its own permission, and folding it in here would make one
 * request able to both move a booking and rewrite a registry record.
 */
export const mergeChannelDraftPatientSchema = z.object({
  targetPatientId: z.string().uuid(),
});

export type MergeChannelDraftPatientInput = z.infer<typeof mergeChannelDraftPatientSchema>;

/**
 * Finds the record a draft should be merged into (§5.2).
 *
 * A lookup of its own rather than a reuse of the patient directory's search,
 * because the two answer different questions. The directory lists patients;
 * this lists *valid merge targets*, which excludes drafts by definition — and
 * it returns the handful of fields a person at a counter uses to confirm they
 * are looking at the right record, which the directory's list projection does
 * not carry.
 */
export const listChannelMergeCandidatesQuerySchema = z.object({
  search: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(25).default(8),
});

export type ListChannelMergeCandidatesQueryInput = z.infer<
  typeof listChannelMergeCandidatesQuerySchema
>;

/**
 * The columns a chat-created draft leaves empty, as the worklist names them
 * (§5.2).
 *
 * A closed list rather than free text, because the front-desk screen renders a
 * label per entry and an unrecognised value would render as nothing at all —
 * the one failure mode that looks exactly like a complete record.
 */
export const CHANNEL_DRAFT_MISSING_FIELDS = [
  'dateOfBirth',
  'sex',
  'address',
  'nik',
  'bpjsNumber',
] as const;

export type ChannelDraftMissingFieldValue = (typeof CHANNEL_DRAFT_MISSING_FIELDS)[number];

/**
 * The subset of {@link CHANNEL_DRAFT_MISSING_FIELDS} whose absence keeps a
 * booking on the worklist.
 *
 * Identifiers are not in it on purpose: a patient may genuinely have neither a
 * NIK on them nor BPJS coverage, and a worklist that never clears is a
 * worklist people stop reading. They are still *reported* as missing, so the
 * desk knows to ask — the difference is between a prompt and a blocker.
 */
export const CHANNEL_DRAFT_REQUIRED_FIELDS = [
  'dateOfBirth',
  'address',
] as const satisfies readonly ChannelDraftMissingFieldValue[];

/**
 * The slice of a GOWA webhook body this gateway accepts (`PCS-T09`, §2.1).
 *
 * **Deliberately not GOWA's full event surface.** It publishes message,
 * receipt, presence, group, and connection events through one URL, and v1
 * answers one of them. Parsing to a narrow shape at the edge is what keeps
 * "the gateway is a dumb pipe" true of the data as well as the code: an event
 * carrying a media payload or a group notification fails this schema and is
 * acknowledged and dropped rather than half-understood.
 *
 * `passthrough` is **not** used, so unknown keys are stripped rather than
 * carried into anything that persists them.
 */
export const gowaWebhookPayloadSchema = z.object({
  id: z.string(),
  /**
   * The chat's JID. Equal to `from` for a one-to-one chat and a `@g.us` group
   * id otherwise, which is how a group is recognised and refused.
   */
  chat_id: z.string(),
  /** The sender's full JID, e.g. `628123456789@s.whatsapp.net`. */
  from: z.string().optional(),
  from_name: z.string().optional(),
  /** RFC 3339. */
  timestamp: z.string().optional(),
  /**
   * True when the clinic's own device sent it. Echoed back to us on every
   * outbound message, and dropping these is what stops the bot answering
   * itself.
   */
  is_from_me: z.boolean().optional(),
  body: z.string().optional(),
});

export type GowaWebhookPayloadInput = z.infer<typeof gowaWebhookPayloadSchema>;

export const gowaWebhookEventSchema = z.object({
  event: z.string(),
  device_id: z.string().optional(),
  session_id: z.string().optional(),
  payload: gowaWebhookPayloadSchema.optional(),
});

export type GowaWebhookEventInput = z.infer<typeof gowaWebhookEventSchema>;

/** GOWA's event name for an inbound message. Everything else is dropped. */
export const GOWA_MESSAGE_EVENT = 'message';

/**
 * The suffix this codebase stores a one-to-one WhatsApp chat under.
 *
 * **A canonical form, not a wire form.** The two bridges disagree: GOWA speaks
 * `@s.whatsapp.net` and WAHA speaks `@c.us`, and both mean the same person.
 * Storing whichever one happened to deliver a message would make
 * `(channel, externalChatId)` — the key a conversation, its transcript, and
 * every `ChannelPatientLink` hang off — depend on the bridge in front of it,
 * so switching gateways would silently orphan every live conversation and
 * every proven verification. That is not a fallback; it is a migration.
 *
 * So both normalizers canonicalise to this suffix and both adapters render it
 * back to their own wire form on the way out. GOWA's value was chosen as the
 * canonical one for the boring reason: it is already in the database from
 * `PCS-T09`, so `PCS-T10` needs no migration.
 */
export const WHATSAPP_USER_JID_SUFFIX = '@s.whatsapp.net';

/** WAHA's suffix for the same thing. Groups end in `@g.us` on both bridges. */
export const WAHA_USER_JID_SUFFIX = '@c.us';

/** Group chats, which v1 refuses on both bridges. */
export const WHATSAPP_GROUP_JID_SUFFIX = '@g.us';

/**
 * Which self-hosted WhatsApp bridge is configured (D-CS-01).
 *
 * `GOWA` is the pragmatic v1 (`PCS-T09`) and `WAHA` the tested fallback
 * (`PCS-T10`). Both sit behind one port, so this value picks a provider
 * binding rather than a code path — and the official Cloud API joins the enum
 * as a third value when it lands, not as a rewrite.
 */
export const WA_GATEWAY_KINDS = ['GOWA', 'WAHA'] as const;

export type WaGatewayKindValue = (typeof WA_GATEWAY_KINDS)[number];

/**
 * The digits in front of the JID's suffix.
 *
 * A JID is `<number>@s.whatsapp.net`, sometimes with a `:device` part on the
 * user half — `628123456789:12@s.whatsapp.net` is the same person on their
 * second linked device. Both are stripped, because the thing being compared
 * against a patient record is a phone number.
 */
export function extractPhoneNumberFromJid(jid: string): string {
  const [userPart = ''] = jid.split('@');
  const [phoneNumber = ''] = userPart.split(':');
  return phoneNumber;
}

/**
 * Rewrites any one-to-one WhatsApp JID into {@link WHATSAPP_USER_JID_SUFFIX}
 * form.
 *
 * This is what makes `WA_GATEWAY_KIND` a genuine switch rather than a
 * one-way door: a customer mid-conversation on GOWA keeps the same
 * conversation, transcript, and verification when the clinic fails over to
 * WAHA, because both bridges' addresses reduce to the same stored id.
 *
 * Returns `null` for anything that is not a one-to-one address — a group, an
 * empty string, a JID with no digits — so callers refuse rather than invent a
 * conversation key from a room.
 */
export function toCanonicalWhatsappJid(jid: string): string | null {
  const trimmed = jid.trim();
  if (trimmed === '' || trimmed.endsWith(WHATSAPP_GROUP_JID_SUFFIX)) {
    return null;
  }
  const phoneNumber = extractPhoneNumberFromJid(trimmed);
  // Digits only: `status@broadcast` and WAHA's `@newsletter` addresses both
  // parse to a non-numeric user part, and neither is a person to reply to.
  if (phoneNumber === '' || !/^[0-9]+$/.test(phoneNumber)) {
    return null;
  }
  return `${phoneNumber}${WHATSAPP_USER_JID_SUFFIX}`;
}

/**
 * The slice of a WAHA webhook body this gateway accepts (`PCS-T10`, §2.1).
 *
 * Narrow for the same reason GOWA's is: WAHA publishes message, ack, presence,
 * group, poll, call, and session-status events through one URL, and v1 answers
 * one of them.
 *
 * The shape differs from GOWA's in three ways that matter, and each is a place
 * a copy-pasted normalizer would be quietly wrong: the sender field is `from`
 * with no separate chat id, `fromMe` is camelCase where GOWA sends
 * `is_from_me`, and `timestamp` is **Unix seconds** where GOWA sends RFC 3339.
 * A number read as a date string is the epoch.
 */
export const wahaWebhookPayloadSchema = z.object({
  id: z.string(),
  /** The chat's JID: `<number>@c.us` for a person, `@g.us` for a group. */
  from: z.string(),
  to: z.string().optional(),
  fromMe: z.boolean().optional(),
  /** Unix seconds, not milliseconds and not a date string. */
  timestamp: z.number().optional(),
  body: z.string().optional(),
  hasMedia: z.boolean().optional(),
});

export type WahaWebhookPayloadInput = z.infer<typeof wahaWebhookPayloadSchema>;

export const wahaWebhookEventSchema = z.object({
  event: z.string(),
  session: z.string().optional(),
  engine: z.string().optional(),
  payload: wahaWebhookPayloadSchema.optional(),
});

export type WahaWebhookEventInput = z.infer<typeof wahaWebhookEventSchema>;

/**
 * One inbound webhook body, before either bridge's shape is known.
 *
 * A **superset** of the two schemas above rather than a union of them, for one
 * blunt reason and one design one. The blunt one: `createZodDto` needs a
 * statically known object type, and a union has none. The design one: this
 * schema's job is only to get a body through the pipe with unknown keys
 * stripped — deciding *what it means* is the normalizer's, and it does that
 * against the bridge the deployment is configured for. Validating the narrow
 * shape here would put the GOWA/WAHA choice in two places.
 *
 * One route for both bridges is itself the point (`PCS-T10`): the webhook URL
 * is registered inside the running container, so a failover that also required
 * editing it would be a failover with an extra step to forget under pressure.
 */
export const whatsappWebhookEventSchema = z.object({
  event: z.string(),
  /** GOWA. */
  device_id: z.string().optional(),
  session_id: z.string().optional(),
  /** WAHA. */
  session: z.string().optional(),
  engine: z.string().optional(),
  payload: z
    .object({
      id: z.string().optional(),
      /** GOWA's chat JID. WAHA has none — its `from` is the chat. */
      chat_id: z.string().optional(),
      from: z.string().optional(),
      from_name: z.string().optional(),
      to: z.string().optional(),
      /** GOWA. */
      is_from_me: z.boolean().optional(),
      /** WAHA. */
      fromMe: z.boolean().optional(),
      /**
       * GOWA sends RFC 3339; WAHA sends Unix **seconds**. Accepted as either
       * and read by the normalizer that knows which — a number parsed as a
       * date string is `NaN`, and a seconds value read as milliseconds is
       * 1970, neither of which errors anywhere.
       */
      timestamp: z.union([z.string(), z.number()]).optional(),
      body: z.string().optional(),
      hasMedia: z.boolean().optional(),
    })
    .optional(),
});

export type WhatsappWebhookEventInput = z.infer<typeof whatsappWebhookEventSchema>;

/** How far back §8.4's metrics look. Two weeks covers the rollout gate. */
export const CHANNEL_METRICS_MAX_DAYS = 90;
export const CHANNEL_METRICS_DEFAULT_DAYS = 14;

export const channelMetricsQuerySchema = z.object({
  /**
   * Defaults to fourteen days because that is the window the `PCS-T11`
   * go/no-go checklist asks about — "two clean weeks on Telegram" is not a
   * figure of speech, it is the gate.
   */
  days: z.coerce
    .number()
    .int()
    .min(1)
    .max(CHANNEL_METRICS_MAX_DAYS)
    .default(CHANNEL_METRICS_DEFAULT_DAYS),
});

export type ChannelMetricsQueryInput = z.infer<typeof channelMetricsQuerySchema>;

/**
 * Why the counter is being shown a particular record as a possible match
 * (`P17-T04`).
 *
 * Reasons rather than a bare score, because a clerk about to spend — or not
 * spend — an MRN is making an identity decision, and "0.82" tells them nothing
 * about what to check. `PHONE_EXACT` means look at the number on the card;
 * `NAME_SIMILAR` means look at the person. The two are not interchangeable and
 * a single confidence number would flatten them into one.
 *
 * Ordered strongest first: a NIK is an issued national identifier, a phone
 * number is a shared household object, and a name is a coincidence waiting to
 * happen.
 */
export const PROSPECTIVE_MATCH_REASONS = ['NIK_EXACT', 'PHONE_EXACT', 'NAME_SIMILAR'] as const;

export const prospectiveMatchReasonSchema = z.enum(PROSPECTIVE_MATCH_REASONS);

export type ProspectiveMatchReasonValue = z.infer<typeof prospectiveMatchReasonSchema>;

/**
 * The arrival worklist's own list, keyed on the prospective record rather than
 * on the appointment (`P17-T04`).
 *
 * Distinct from `listChannelArrivalsQuerySchema`, which lists *bookings* in a
 * date window. This lists *people the clinic has not registered yet*, and the
 * two diverge exactly when it matters: somebody who booked for next Tuesday
 * and walked in today is absent from the day's arrival window and is standing
 * at the counter.
 */
export const listProspectivePatientsQuerySchema = z.object({
  status: prospectivePatientStatusSchema.default('AWAITING_ARRIVAL'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListProspectivePatientsQueryInput = z.infer<typeof listProspectivePatientsQuerySchema>;

/**
 * The search that has to happen before an MRN can be spent (`P17-T04`).
 *
 * Every field is optional and the endpoint still searches: with nothing
 * supplied it seeds from the prospective record's own name and phone number,
 * which is the search the clerk would have typed anyway. `search` overrides
 * that once they start typing what the person actually said their name was,
 * and `nik` is the exact lookup they run off the ID document in their hand.
 *
 * `nik` is a query parameter and never lands in a response. It is hashed to
 * the blind index, compared, and discarded — this route can confirm that a
 * record holds a given NIK, and can never be used to read one back out.
 */
export const listProspectiveMatchCandidatesQuerySchema = z.object({
  search: z.string().trim().min(2).max(120).optional(),
  nik: nikSchema.optional(),
  limit: z.coerce.number().int().min(1).max(25).default(8),
});

export type ListProspectiveMatchCandidatesQueryInput = z.infer<
  typeof listProspectiveMatchCandidatesQuerySchema
>;

/**
 * The person at the counter turned out to be a patient the clinic already has
 * (`P17-T04`).
 *
 * One id, for the same reason `mergeChannelDraftPatientSchema` carries one:
 * linking moves a booking, it does not edit a registry record. A request that
 * could do both would let the arrival screen rewrite demographics on a patient
 * it merely matched.
 */
export const linkProspectivePatientSchema = z.object({
  patientId: z.string().uuid(),
});

export type LinkProspectivePatientInput = z.infer<typeof linkProspectivePatientSchema>;

/**
 * The person at the counter is genuinely new, so this is where the MRN is
 * spent (`P17-T04`).
 *
 * **Deliberately `createPatientSchema` itself and not a variant of it.** The
 * whole safety of the conversion path is that it produces an ordinary patient
 * record through the ordinary create — same required demographics, same
 * identifier validation, same privacy-notice evidence, same encryption path. A
 * loosened "conversion create" would become the way a record gets registered
 * without a date of birth, which is the thing `P17-T01` opened the prospective
 * table to avoid in the first place.
 */
export const convertProspectivePatientSchema = createPatientSchema;

export type ConvertProspectivePatientInput = z.infer<typeof convertProspectivePatientSchema>;
