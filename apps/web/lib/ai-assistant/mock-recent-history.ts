// DUMMY-DATA: recent consultation history is static preview content. Chat sessions have no
// MVP backend — the chat.session/chat.message contract ships post-MVP in Phase 13 (see
// docs/post-mvp/ai-chatbot.md). Replace with a chat-session list endpoint when it exists.
export type ConsultationHistoryEntry = {
  id: string;
  title: string;
};

export function buildMockRecentHistory(locale: AppLocale): ConsultationHistoryEntry[] {
  const t = createAiAssistantTranslator(locale);
  return [
    { id: 'history-medication-conflict', title: t('history.medicationConflict') },
    { id: 'history-icd-lookup', title: t('history.icdLookup') },
    { id: 'history-shift-handover', title: t('history.shiftHandover') },
  ];
}
import type { AppLocale } from '../../i18n/config';
import { createAiAssistantTranslator } from '#lib/ai-assistant/localization';
