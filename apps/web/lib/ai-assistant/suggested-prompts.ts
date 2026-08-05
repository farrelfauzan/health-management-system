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

/**
 * The starters for the channel the conversation is actually on.
 *
 * A starter is a promise about what the assistant can answer, so offering the
 * clinical set to an administrator is worse than offering nothing: the admin
 * channel has no patient-summary or scheduling tool behind it, and every
 * clinical starter would spend a turn discovering that. The admin set names
 * the three lookups that channel really has — queue volume, practice-session
 * capacity, and medication expiry.
 */
export function buildSuggestedPrompts(
  locale: AppLocale,
  channel: ChatChannelValue,
): SuggestedPrompt[] {
  const t = createAiAssistantTranslator(locale);
  if (channel === 'ADMIN') {
    return [
      {
        id: 'queue-volume',
        title: t('prompts.queueVolume.title'),
        description: t('prompts.queueVolume.description'),
        messageText: t('prompts.queueVolume.message'),
      },
      {
        id: 'appointment-load',
        title: t('prompts.appointmentLoad.title'),
        description: t('prompts.appointmentLoad.description'),
        messageText: t('prompts.appointmentLoad.message'),
      },
      {
        id: 'medication-expiry',
        title: t('prompts.medicationExpiry.title'),
        description: t('prompts.medicationExpiry.description'),
        messageText: t('prompts.medicationExpiry.message'),
      },
    ];
  }
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
import type { ChatChannelValue } from '@hms/shared-types';

import type { AppLocale } from '../../i18n/config';
import { createAiAssistantTranslator } from '#lib/ai-assistant/localization';
