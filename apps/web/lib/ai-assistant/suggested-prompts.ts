/**
 * Static conversation starters for the assistant sidebar. These are UX
 * affordances, not sample data: the text they insert is a real question the
 * user sends to the provider like any other message.
 */
export type SuggestedPrompt = {
  id: string;
  title: string;
  description: string;
  messageText: string;
};

export function buildSuggestedPrompts(locale: AppLocale): SuggestedPrompt[] {
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
