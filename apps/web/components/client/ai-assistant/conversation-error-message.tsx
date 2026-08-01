'use client';

import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { ErrorConversationMessage } from '#lib/ai-assistant/conversation-types';

type ConversationErrorMessageProps = {
  message: ErrorConversationMessage;
  isBusy: boolean;
  onRetry: (messageId: string) => void;
};

export function ConversationErrorMessage({
  message,
  isBusy,
  onRetry,
}: ConversationErrorMessageProps) {
  const t = useTranslations('aiAssistant.conversation');
  return (
    <div
      role="alert"
      className="flex gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
    >
      <Icon name="error" size={20} className="mt-0.5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-slate-800">{t('replyFailed')}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy}
          onClick={() => onRetry(message.id)}
        >
          <Icon name="refresh" size={18} className="text-current" />
          {t('retry')}
        </Button>
      </div>
    </div>
  );
}
