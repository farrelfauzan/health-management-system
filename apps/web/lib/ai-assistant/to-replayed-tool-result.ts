import type { ChatToolResultView } from '@hms/shared-types';

import { parseToolResult } from '#lib/ai-assistant/parse-tool-result';
import type { ParsedToolResult } from '#lib/ai-assistant/parsed-tool-result';

const TOOL_OUTCOMES: readonly string[] = ['SUCCESS', 'FAILED'];

/**
 * Recovers a tool lookup from a stored `SYSTEM` turn, so reopening a
 * consultation shows the same cards it showed live rather than an
 * announcement with nothing under it.
 *
 * `SYSTEM` turns carry two different payloads: the context-enrichment
 * snapshot and, since Phase 15, one per executed tool call. Neither is
 * conversation, so the transcript projection drops everything this returns
 * `null` for — which is how a context turn stays invisible without needing a
 * marker column to tell the two apart.
 */
export function toReplayedToolResult(content: string): ParsedToolResult | null {
  const candidate = readJsonObject(content);
  if (
    candidate === null ||
    typeof candidate.toolName !== 'string' ||
    typeof candidate.outcome !== 'string' ||
    !TOOL_OUTCOMES.includes(candidate.outcome)
  ) {
    return null;
  }
  return parseToolResult(candidate as unknown as ChatToolResultView);
}

function readJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
