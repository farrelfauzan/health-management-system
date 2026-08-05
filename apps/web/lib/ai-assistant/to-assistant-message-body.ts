import type { ChatExchangeMeta } from '@hms/shared-types';

import type { AssistantMessageBody } from '#lib/ai-assistant/conversation-types';
import { parseToolResult } from '#lib/ai-assistant/parse-tool-result';

/**
 * Splits an assistant reply into the paragraph shape the thread renders:
 * blank-line separated chunks, each kept exactly as the model wrote it.
 *
 * The markdown a model emits is resolved at **render** time
 * (`parseMarkdownBlock`), not here, and only for a closed subset — emphasis,
 * code, headings, lists. Keeping the raw text on the body is what lets the
 * stored transcript and the replayed one stay the same string, and keeping
 * the subset closed is what stops a reply carrying markup a provider chose.
 *
 * Shared by the live send path and the transcript-replay path so a reopened
 * consultation is laid out exactly as it was when it arrived.
 *
 * `meta.toolResults` is narrowed here rather than in the components: the
 * envelope types every tool's payload as `unknown`, and parsing once at the
 * boundary is what keeps a shape mismatch a visible notice instead of a
 * render-time crash.
 */
export function toAssistantMessageBody(
  content: string,
  meta?: Pick<ChatExchangeMeta, 'disclaimer' | 'toolResults'>,
): AssistantMessageBody {
  const toolResults = (meta?.toolResults ?? []).map((view) => parseToolResult(view));
  return {
    paragraphs: content
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0),
    ...(meta?.disclaimer === undefined ? {} : { disclaimer: meta.disclaimer }),
    ...(toolResults.length === 0 ? {} : { toolResults }),
  };
}
