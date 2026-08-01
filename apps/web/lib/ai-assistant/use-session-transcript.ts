import type { ChatMessageView } from '@hms/shared-types';

import {
  chatControllerListMessagesV1,
  getChatControllerListMessagesV1QueryKey,
} from '#lib/api/generated/ai-chatbot/ai-chatbot';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The API's page ceiling. A reopened consultation shows its first page of
 * turns; deeper history stays behind the cursor rather than being silently
 * truncated to a smaller number the UI picked for itself.
 */
const TRANSCRIPT_PAGE_LIMIT = 100;

/**
 * One session's turns, in reading order, for replaying a past consultation.
 * Disabled until a session is actually open — the common case is a brand-new
 * conversation, which has no transcript to fetch — and `retry: false` because
 * a 503 here means chat is switched off, which retrying cannot change.
 */
export function useSessionTranscript(sessionId: string | null) {
  return useApiQuery<ChatMessageView[]>({
    queryKey: getChatControllerListMessagesV1QueryKey(sessionId ?? 'none', {
      limit: TRANSCRIPT_PAGE_LIMIT,
    }),
    queryFn: (signal) =>
      chatControllerListMessagesV1(sessionId ?? '', { limit: TRANSCRIPT_PAGE_LIMIT }, signal),
    errorMessage: 'Unable to load this consultation.',
    enabled: sessionId !== null,
    options: { retry: false },
  });
}
