// DUMMY-DATA: suggested analysis prompts are static preview content. The AI chatbot backend
// (chat sessions, contextual prompt suggestions) ships post-MVP in Phase 13 — see
// docs/post-mvp/ai-chatbot.md. Replace with a suggestions endpoint when it exists.
export type SuggestedPrompt = {
  id: string;
  title: string;
  description: string;
  messageText: string;
};

export function buildMockSuggestedPrompts(locale: AppLocale): SuggestedPrompt[] {
  const t = createAiAssistantTranslator(locale);
  return [
    {
      id: 'patient-load',
      title: t('prompts.patientLoad.title'),
      description: t('prompts.patientLoad.description'),
      messageText: t('prompts.patientLoad.message'),
    },
    {
      id: 'cardiology-slot',
      title: t('prompts.cardiologySlot.title'),
      description: t('prompts.cardiologySlot.description'),
      messageText: t('prompts.cardiologySlot.message'),
    },
    {
      id: 'discharge-draft',
      title: t('prompts.dischargeDraft.title'),
      description: t('prompts.dischargeDraft.description'),
      messageText: t('prompts.dischargeDraft.message'),
    },
  ];
}
import type { AppLocale } from '../../i18n/config';
import { createAiAssistantTranslator } from '#lib/ai-assistant/localization';
