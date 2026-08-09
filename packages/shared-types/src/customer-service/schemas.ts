import { z } from 'zod';

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
