'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ADMIN_REPLY_MAX_LENGTH, type ConversationStateValue } from '@hms/shared-types';
import { Button, Textarea } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { csAdminControllerReplyV1 } from '#lib/api/generated/customer-service/customer-service';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateConversationQueries } from '#lib/conversations/invalidate-conversation-queries';

type ConversationReplyFormProps = {
  conversationId: string;
  state: ConversationStateValue;
  isBlocked: boolean;
  onFailed: (message: string) => void;
};

/**
 * The composer.
 *
 * Disabled in exactly the two situations the API also refuses, rather than
 * letting the request fail and explaining afterwards: a conversation resolving
 * a possession challenge, where an admin reply would land in a flow that
 * compares strings to a hash, and a blocked chat, where nothing is being
 * delivered anyway. The reason is stated in place of the button, because
 * "why is this greyed out" is the question a disabled control always raises.
 *
 * Sending takes the conversation over — the API does that in the same call —
 * so there is no separate "take over first" step to forget. The transcript and
 * the inbox are both invalidated afterwards, since the state has changed as
 * well as the message list.
 */
export function ConversationReplyForm({
  conversationId,
  state,
  isBlocked,
  onFailed,
}: ConversationReplyFormProps) {
  const t = useTranslations('conversations.reply');
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const replyMutation = useMutation({
    mutationFn: async (value: string) => {
      await csAdminControllerReplyV1(conversationId, { text: value });
    },
    onSuccess: async () => {
      setText('');
      await invalidateConversationQueries(queryClient, conversationId);
    },
    onError: (error: unknown) => {
      onFailed(resolveApiErrorMessage(error, t('failed')));
    },
  });

  if (isBlocked) {
    return <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{t('blocked')}</p>;
  }
  if (state === 'AWAITING_OTP') {
    return (
      <p className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900">{t('awaitingOtp')}</p>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const value = text.trim();
        if (value.length === 0) {
          return;
        }
        replyMutation.mutate(value);
      }}
    >
      <Textarea
        value={text}
        rows={3}
        maxLength={ADMIN_REPLY_MAX_LENGTH}
        placeholder={t('placeholder')}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-slate-500">{t('takesOver')}</p>
        <Button type="submit" disabled={replyMutation.isPending || text.trim().length === 0}>
          {replyMutation.isPending ? t('sending') : t('send')}
        </Button>
      </div>
    </form>
  );
}
