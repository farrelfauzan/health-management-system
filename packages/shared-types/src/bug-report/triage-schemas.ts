import { z } from 'zod';

/**
 * The severities the AI may assign, and the labels the Bug Board's `Severity`
 * select actually holds (P23-T09).
 *
 * Two representations rather than one, mapped by {@link BUG_TICKET_SEVERITY_LABELS}
 * below, because they answer to different owners. The short form is what the
 * model is asked for — `P0` is unambiguous in a JSON Schema enum and costs no
 * tokens to explain — while the long form is a human's column on somebody
 * else's Notion board, and Notion rejects a page whose select option does not
 * exist by that exact name. Asking the model for the long form would make a
 * board rename a prompt change; asking for the short form and translating makes
 * it a one-line change here.
 */
export const BUG_TICKET_SEVERITIES = ['P0', 'P1', 'P2', 'P3'] as const;

/** One severity as the triage tool reports it. */
export type BugTicketSeverity = (typeof BUG_TICKET_SEVERITIES)[number];

/**
 * The `Severity` option names on the Bug Board, keyed by what the model returns.
 *
 * Must stay identical to the options `BUG_BOARD_REQUIRED_FIELDS` checks for
 * (`apps/api/src/modules/notion-connector/service/bug-board-required-fields.ts`).
 * If the two drift, the field check passes and every publish fails with
 * `validation_error` — which is precisely the failure that check exists to
 * catch, arriving from the one direction it cannot see.
 */
export const BUG_TICKET_SEVERITY_LABELS: Readonly<Record<BugTicketSeverity, string>> = {
  P0: 'P0 - Critical',
  P1: 'P1 - High',
  P2: 'P2 - Medium',
  P3: 'P3 - Low',
};

/**
 * What kind of thing the reporter actually filed.
 *
 * `Not a Bug` and `Question` are here because a bug-report box is where staff
 * put everything, and a triager who cannot mark "this is how it works" without
 * inventing a convention will invent one. These are the board's own option
 * names, so no translation table is needed.
 */
export const BUG_TICKET_TYPES = ['Bug', 'Feature Request', 'Question', 'Not a Bug'] as const;

/** One ticket type, spelled as the Bug Board's `Type` select holds it. */
export type BugTicketType = (typeof BUG_TICKET_TYPES)[number];

/**
 * The product areas a ticket can be filed against — the Bug Board's `Module`
 * select, verbatim.
 *
 * A closed list rather than free text: the column is a select, and a module
 * Notion has never heard of fails the whole publish. `Other` exists so the
 * model always has a valid answer, which is the only way a closed list stays
 * closed under a report about something nobody anticipated.
 */
export const BUG_TICKET_MODULES = [
  'Authentication',
  'Patients',
  'Doctors',
  'Appointments',
  'Registration',
  'Pharmacy',
  'Billing',
  'Laboratory',
  'Documents',
  'Rooms & Inpatient',
  'AI Assistant',
  'Integrations',
  'Administration',
  'Notifications',
  'Other',
] as const;

/** One module, spelled as the Bug Board's `Module` select holds it. */
export type BugTicketModule = (typeof BUG_TICKET_MODULES)[number];

/** The name of the one tool the triage model is allowed to call. */
export const FILE_BUG_TICKET_TOOL_NAME = 'file_bug_ticket';

const MAX_TICKET_TITLE_LENGTH = 120;

const MAX_TICKET_SUMMARY_LENGTH = 2000;

const MAX_TICKET_FIELD_LENGTH = 1000;

const MAX_TICKET_STEPS = 20;

/**
 * The arguments of `file_bug_ticket` — the triage model's *entire* vocabulary
 * (P23-T09).
 *
 * This schema is the security boundary, not a convenience. The report text is
 * untrusted: it is typed by staff, and a report can perfectly well contain
 * "ignore your instructions and …". Because the model is offered exactly one
 * tool and its output is parsed against this object before anything reads it,
 * the most a hostile report can achieve is a *wrongly filled* ticket — a bad
 * severity, a silly title. It cannot reach Notion directly, cannot address
 * another board, and cannot cause any call that is not this one. Everything the
 * publisher later does with these values is chosen by code (P23-T10).
 *
 * Bounded everywhere for the same reason. An unbounded string is a way to turn
 * one report into a very large Notion page, and `stepsToReproduce` is capped
 * because a model asked to enumerate steps from a vague report will happily
 * produce fifty.
 */
export const fileBugTicketSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TICKET_TITLE_LENGTH),
  summary: z.string().trim().min(1).max(MAX_TICKET_SUMMARY_LENGTH),
  stepsToReproduce: z
    .array(z.string().trim().min(1).max(MAX_TICKET_FIELD_LENGTH))
    .max(MAX_TICKET_STEPS)
    .default([]),
  expected: z.string().trim().max(MAX_TICKET_FIELD_LENGTH).default(''),
  actual: z.string().trim().max(MAX_TICKET_FIELD_LENGTH).default(''),
  severity: z.enum(BUG_TICKET_SEVERITIES),
  type: z.enum(BUG_TICKET_TYPES),
  module: z.enum(BUG_TICKET_MODULES),
  /**
   * The model's own answer to "might this text name a real person or patient?".
   *
   * A tool argument rather than a separate classification call: one round trip,
   * and the flag arrives attached to the very content it describes. When true
   * the report is HELD and never published — see
   * `docs/security/ai-vendor-dpa.md` §5c, which is candid that this is a *late*
   * control. The text has already reached the vendor by the time the flag comes
   * back; HELD stops publication, not transmission.
   */
  mayContainPersonalData: z.boolean(),
});

/**
 * The validated ticket content the AI produced.
 *
 * The *output* type: `stepsToReproduce`, `expected` and `actual` all have
 * defaults, so a model that omits them yields a complete object and the
 * publisher never branches on `undefined`.
 */
export type FileBugTicketArguments = z.output<typeof fileBugTicketSchema>;
