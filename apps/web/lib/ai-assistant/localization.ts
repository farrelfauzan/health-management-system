import { createTranslator } from 'next-intl';

import type { AppLocale } from '../../i18n/config';
import { getDashboardAiMessages } from '#lib/dashboard/localization';

export function createAiAssistantTranslator(locale: AppLocale) {
  return createTranslator({
    locale,
    messages: getDashboardAiMessages(locale),
    namespace: 'aiAssistant',
  });
}
