'use client';

import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

export function TypingIndicator() {
  const t = useTranslations('aiAssistant.conversation');
  return (
    <div className="flex gap-4" role="status" aria-label={t('preparingResponse')}>
      <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
        <Icon name="smart_toy" size={20} className="text-current" />
      </div>
      <div className="mt-2 flex items-center gap-1">
        <span className="size-2 animate-bounce rounded-full bg-slate-400" />
        <span className="size-2 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
        <span className="size-2 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
      </div>
    </div>
  );
}
