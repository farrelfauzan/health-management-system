import {
  BugReportPublishRecord,
  BUG_TICKET_SEVERITY_LABELS,
  FileBugTicketArguments,
} from '@hms/shared-types';

/**
 * The Bug Board's `Reporter Role` options, keyed by the role codes `seed.sql`
 * grants `bug-report.create:own`.
 *
 * A translation table because the two vocabularies belong to different owners:
 * `LAB_TECHNICIAN` is this database's word, `Lab Technician` is a column on
 * somebody's Notion board, and Notion rejects a page whose select option does
 * not exist by that exact name. A code with no entry — a custom role a clinic
 * created, or one added after this table — falls back to `Admin` rather than
 * failing the publish: getting the ticket onto the board with a slightly wrong
 * role beats losing the bug report entirely.
 */
const REPORTER_ROLE_LABELS: Readonly<Record<string, string>> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  DOCTOR: 'Doctor',
  PHARMACIST: 'Pharmacist',
  LAB_TECHNICIAN: 'Lab Technician',
};

const FALLBACK_REPORTER_ROLE_LABEL = 'Admin';

/**
 * The title a `FALLBACK` ticket gets when no model wrote one.
 *
 * The reference rather than the reporter's own title: a title is free text the
 * detector may have redacted mid-sentence, and the board's Title column is the
 * one field that shows up in every Notion view, search result and notification.
 * The words are in the page body, where a triager reads them deliberately.
 */
const FALLBACK_TITLE_PREFIX = 'Bug report';

/** The Bug Board's `Status` options the publisher is allowed to set. */
const STATUS_TRIAGED = 'Triaged';

const STATUS_NEW = 'New';

/** The default severity and module for a ticket no model classified. */
const FALLBACK_SEVERITY_LABEL = BUG_TICKET_SEVERITY_LABELS.P2;

const FALLBACK_MODULE = 'Other';

const FALLBACK_TYPE = 'Bug';

const MAX_NOTION_TITLE_LENGTH = 200;

export type BugBoardPropertiesInput = {
  readonly report: BugReportPublishRecord;
  readonly clinicLabel: string;
};

/**
 * Maps a triaged report onto the Bug Board's page properties (P23-T10).
 *
 * **Code does this, not the AI.** The model returned ticket *content* and
 * nothing else; every decision here — which board, which columns, what `Status`
 * means, which clinic — is made by this function, from values the model cannot
 * reach. That separation is the whole reason a report crafted to make the
 * assistant "publish something else" has nothing to publish with (§5c).
 *
 * `Status` is the load-bearing one: `Triaged` when a model wrote the ticket,
 * `New` when nobody did. A triager who cannot tell a summary from a raw report
 * will trust a summary that was never written.
 *
 * The reporter is a *role*, never a person. Nothing in this object carries a
 * user id, a name or an email — §5c, "the reporter's identity".
 */
export function buildBugBoardProperties(
  input: BugBoardPropertiesInput,
): Record<string, unknown> {
  const { report, clinicLabel } = input;
  const triage = report.triage;
  return {
    Title: { title: [{ text: { content: buildTitle(report, triage) } }] },
    'Report ID': buildRichText(report.reference),
    Status: { select: { name: triage === null ? STATUS_NEW : STATUS_TRIAGED } },
    Severity: {
      select: {
        name: triage === null ? FALLBACK_SEVERITY_LABEL : BUG_TICKET_SEVERITY_LABELS[triage.severity],
      },
    },
    Type: { select: { name: triage?.type ?? FALLBACK_TYPE } },
    Module: { select: { name: triage?.module ?? FALLBACK_MODULE } },
    Clinic: buildRichText(clinicLabel),
    'Reporter Role': {
      select: {
        name: REPORTER_ROLE_LABELS[report.reporterRole] ?? FALLBACK_REPORTER_ROLE_LABEL,
      },
    },
    Page: buildRichText(report.pagePath),
    // Joined into one cell rather than a multi-select: these are our own log
    // correlation ids, not a taxonomy, and every distinct value would otherwise
    // become a permanent option on somebody's board.
    'Request IDs': buildRichText(report.requestIds.join(', ')),
    'Triaged By': { select: { name: report.triagedBy === 'AI' ? 'AI' : 'Fallback' } },
    'App Version': buildRichText(report.appVersion ?? ''),
    'Reported At': { date: { start: report.createdAt.toISOString() } },
  };
}

function buildTitle(
  report: BugReportPublishRecord,
  triage: FileBugTicketArguments | null,
): string {
  const title = triage === null ? `${FALLBACK_TITLE_PREFIX} ${report.reference}` : triage.title;
  return title.slice(0, MAX_NOTION_TITLE_LENGTH);
}

/**
 * Notion rejects a rich-text array element with empty content, so an empty value
 * becomes an empty array — which the API reads as a cleared cell.
 */
function buildRichText(value: string): Record<string, unknown> {
  return { rich_text: value === '' ? [] : [{ text: { content: value } }] };
}
