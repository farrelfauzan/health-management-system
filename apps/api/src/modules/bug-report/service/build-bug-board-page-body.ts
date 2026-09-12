import { BugReportPublishRecord } from '@hms/shared-types';

import { buildNotionParagraphBlocks } from '../../../common/notion/build-notion-paragraph-blocks';
import { NotionParagraphBlock } from '../../../common/notion/notion.types';

/**
 * Builds the Notion page body for one ticket (P23-T10).
 *
 * Two shapes, because the two kinds of ticket are genuinely different documents.
 * An `AI` ticket is a structured summary — heading, steps, expected vs actual —
 * written by a model that read the report. A `FALLBACK` ticket has no summary at
 * all, so it carries the reporter's own redacted words under a line saying so:
 * a triager must be able to tell at a glance that nobody condensed this, because
 * the two demand different amounts of reading.
 *
 * Everything goes through `buildNotionParagraphBlocks`, which owns the two
 * limits the API enforces — 2,000 characters per rich-text object and 100 child
 * blocks per request — and truncates with a visible notice rather than splitting
 * across a follow-up append call. A second call is a second chance to
 * half-create a page, which is the failure this whole step is built to avoid.
 */
export function buildBugBoardPageBody(report: BugReportPublishRecord): NotionParagraphBlock[] {
  const lines = report.triage === null ? buildFallbackLines(report) : buildTriagedLines(report);
  return buildNotionParagraphBlocks(lines.join('\n'));
}

function buildTriagedLines(report: BugReportPublishRecord): string[] {
  const triage = report.triage;
  if (triage === null) {
    return [];
  }
  return [
    'Summary',
    triage.summary,
    ...(triage.stepsToReproduce.length === 0
      ? []
      : ['', 'Steps to reproduce', ...triage.stepsToReproduce.map((step, index) => `${index + 1}. ${step}`)]),
    ...(triage.expected === '' ? [] : ['', 'Expected', triage.expected]),
    ...(triage.actual === '' ? [] : ['', 'Actual', triage.actual]),
  ];
}

/**
 * The reporter's redacted words, under a line that says nobody summarised them.
 *
 * The notice is not decoration: without it a fallback ticket looks like a
 * badly-written AI ticket, and a triager would read a raw report as though it
 * had already been condensed and checked.
 */
function buildFallbackLines(report: BugReportPublishRecord): string[] {
  return [
    'AI triage was unavailable, so this is the reporter’s own text with identifiers redacted.',
    '',
    report.redactedText ?? '(The report text is no longer available.)',
  ];
}
