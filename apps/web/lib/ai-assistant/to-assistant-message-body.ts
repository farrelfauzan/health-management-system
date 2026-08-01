import type { ChatExchangeMeta } from '@hms/shared-types';

import type { AssistantMessageBody } from '#lib/ai-assistant/conversation-types';

/**
 * Splits an assistant reply into the paragraph shape the thread renders.
 * The API returns plain text — deliberately, since anything richer would be
 * markup a provider could smuggle instructions through — so paragraphs are
 * blank-line separated and nothing is parsed as markdown.
 *
 * Shared by the live send path and the transcript-replay path so a reopened
 * consultation is laid out exactly as it was when it arrived.
 */
export function toAssistantMessageBody(
  content: string,
  meta?: Pick<ChatExchangeMeta, 'disclaimer'>,
): AssistantMessageBody {
  return {
    paragraphs: content
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0),
    ...(meta?.disclaimer === undefined ? {} : { disclaimer: meta.disclaimer }),
  };
}
