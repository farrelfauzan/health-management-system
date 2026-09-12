import { BugReportTriageRecord, DetectSensitiveDataOptions } from '@hms/shared-types';

import { redactBugReportText } from './redact-bug-report-text';

/**
 * Exactly what crosses to the triage vendor (P23-T09), and nothing else.
 *
 * **This type is the §5c boundary, written down.** `docs/security/ai-vendor-dpa.md`
 * §5c claims a specific, finite set of fields leaves for the bug-triage
 * processor, and `vendor-egress-contract.spec.ts` asserts that claim against
 * this object's key set — exhaustively, so a field added here fails CI rather
 * than quietly widening the boundary. If you are adding a field, the honest
 * order is: read §5c, decide whether it may cross, update §5c, then update the
 * test. Not the other way round.
 *
 * What is deliberately absent is as much of the point as what is present:
 * - **No `reporterUserId`, name or email.** The role, and only the role. Notion
 *   and the vendor learn that *a doctor at this clinic* filed it, never which.
 * - **No `requestIds`.** They point at our own log lines and mean nothing to a
 *   model; sending them would be payload for no reader.
 * - **No `userAgent`, no `appVersion`, no `reference`.** The ticket's metadata
 *   is code's business (P23-T10); the model is asked to write prose.
 * - **No patient anything.** There is no field here one could travel in.
 */
export type RedactedBugReport = {
  readonly title: string;
  readonly description: string;
  readonly stepsToReproduce: string | null;
  readonly expected: string | null;
  readonly actual: string | null;
  readonly pagePath: string;
  readonly reporterRole: string;
};

/**
 * Redacts a stored report down to the payload the vendor may see.
 *
 * `pagePath` and `reporterRole` pass through unredacted on purpose: intake
 * already stripped the path's query string and replaced its record ids with
 * `:id` (`cleanBugReportPagePath`), and a role code is a role code. Running the
 * detector over them would only find false positives in route segments.
 */
export function buildRedactedBugReport(
  report: BugReportTriageRecord,
  options: DetectSensitiveDataOptions = {},
): RedactedBugReport {
  return {
    title: redactBugReportText(report.title, options),
    description: redactBugReportText(report.description, options),
    stepsToReproduce: redactOptional(report.stepsToReproduce, options),
    expected: redactOptional(report.expected, options),
    actual: redactOptional(report.actual, options),
    pagePath: report.pagePath,
    reporterRole: report.reporterRole,
  };
}

/**
 * Renders the redacted report as the ticket body for a `FALLBACK` publish.
 *
 * When the vendor never answered there is no AI summary, so the reporter's own
 * redacted words are the ticket — which is the entire reason FALLBACK exists
 * rather than a queue that grows until somebody notices. Labelled sections
 * rather than a blob, because a triager reads this the same way they read an
 * AI-written one.
 */
export function renderRedactedBugReportText(report: RedactedBugReport): string {
  return [
    report.description,
    ...(report.stepsToReproduce === null ? [] : ['', `Langkah: ${report.stepsToReproduce}`]),
    ...(report.expected === null ? [] : ['', `Diharapkan: ${report.expected}`]),
    ...(report.actual === null ? [] : ['', `Terjadi: ${report.actual}`]),
  ].join('\n');
}

function redactOptional(
  value: string | null,
  options: DetectSensitiveDataOptions,
): string | null {
  return value === null ? null : redactBugReportText(value, options);
}
