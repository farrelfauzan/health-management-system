'use client';

import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
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
    <InlineNotice tone="error" title={t('replyFailed')}>
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
    </InlineNotice>
  );
}
