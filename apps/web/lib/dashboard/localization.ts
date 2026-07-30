import type { AppLocale } from '../../i18n/config';
import enMessages from '../../messages/en/dashboard-ai.json';
import idMessages from '../../messages/id/dashboard-ai.json';

export const DASHBOARD_AI_MESSAGES = { en: enMessages, id: idMessages } as const;

export function getDashboardAiMessages(locale: AppLocale) {
  return DASHBOARD_AI_MESSAGES[locale];
}
