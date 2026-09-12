import { FileBugTicketArguments } from '#bug-report/triage-schemas';

/**
 * A report as the triage worker reads it (P23-T09) — the one projection that
 * includes the reporter's free text.
 *
 * Separate from `BugReportRecord` on purpose: that projection deliberately
 * excludes the text, because intake answers with a reference and nothing that
 * reads a report needs the words. This one exists for the single consumer that
 * does, and its own name is what makes "who can see the text" a question with a
 * short, greppable answer.
 *
 * `reporterUserId` is here because the HELD notification is addressed to the
 * reporter. It is the one field that must never travel further: nothing in the
 * triage payload or the Notion page carries it (§5c, "the reporter's identity").
 */
export type BugReportTriageRecord = {
  readonly id: string;
  readonly reference: string;
  readonly reporterUserId: string;
  readonly reporterRole: string;
  readonly title: string;
  readonly description: string;
  readonly stepsToReproduce: string | null;
  readonly expected: string | null;
  readonly actual: string | null;
  readonly pagePath: string;
  readonly requestIds: readonly string[];
  readonly appVersion: string | null;
  readonly attemptCount: number;
  readonly createdAt: Date;
};

/**
 * A triaged report as the publisher reads it (P23-T10).
 *
 * Carries the AI's ticket content, and the redacted original only for a
 * `FALLBACK` row — where there is no AI content, so the reporter's own words
 * (redacted) are the ticket body. `notionPageId` rides along because a retry
 * after an `AMBIGUOUS` failure has to know whether a page was already adopted.
 */
export type BugReportPublishRecord = {
  readonly id: string;
  readonly reference: string;
  readonly reporterRole: string;
  readonly triage: FileBugTicketArguments | null;
  readonly triagedBy: 'AI' | 'FALLBACK';
  readonly redactedText: string | null;
  readonly pagePath: string;
  readonly requestIds: readonly string[];
  readonly appVersion: string | null;
  readonly attemptCount: number;
  readonly notionPageId: string | null;
  readonly createdAt: Date;
};

/** How the worker claims a batch of due rows for exactly one replica. */
export type ClaimBugReportsPayload = {
  readonly status: 'RECEIVED' | 'TRIAGED';
  readonly limit: number;
  readonly leaseMs: number;
  readonly leasedBy: string;
};

/**
 * Settling a report the AI triaged successfully (P23-T09).
 *
 * `redactedText` is stored for a `FALLBACK` settle and left null for an `AI`
 * one: when the model wrote the ticket, keeping a second redacted copy of the
 * same report would add a row to the retention problem for no reader.
 */
export type SettleBugReportTriagedData = {
  readonly id: string;
  readonly triage: FileBugTicketArguments | null;
  readonly triagedBy: 'AI' | 'FALLBACK';
  readonly redactedText: string | null;
};

/** Settling a report the model flagged as possibly carrying personal data. */
export type SettleBugReportHeldData = {
  readonly id: string;
  readonly heldAt: Date;
};

/** A transient triage or publish failure: count it, record why, park the row. */
export type RescheduleBugReportAttemptData = {
  readonly id: string;
  readonly error: string;
  readonly nextAttemptAt: Date;
};

/** A permanent publish failure (P23-T10): the error code only, never a message. */
export type SettleBugReportFailedData = {
  readonly id: string;
  readonly error: string;
};

/** A report that reached the Bug Board (P23-T10). */
export type SettleBugReportPublishedData = {
  readonly id: string;
  readonly notionPageId: string;
  readonly notionPageUrl: string | null;
  readonly publishedAt: Date;
};
