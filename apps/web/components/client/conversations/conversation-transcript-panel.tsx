'use client';

import { useState } from 'react';
import { Card, CardContent } from '@hms/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { ConversationHandoffActions } from '#components/client/conversations/conversation-handoff-actions';
import { ConversationReplyForm } from '#components/client/conversations/conversation-reply-form';
import { ConversationStateBadge } from '#components/client/conversations/conversation-state-badge';
import { ConversationTranscriptMessage } from '#components/client/conversations/conversation-transcript-message';
import { PageHeader } from '#components/shared/page-header';
import { useConversationTranscript } from '#lib/conversations/use-conversation-transcript';

type ConversationTranscriptPanelProps = {
  conversationId: string;
};

/**
 * One conversation: what was said, and the three things staff can do about it.
 *
 * The turns arrive newest-first from the API — that is the page an admin
 * always wants, since the reason they opened the conversation is the last
 * thing said in it — and are reversed here so the exchange reads downward the
 * way a chat does. Reversing in the component rather than asking the API for
 * ascending order keeps the cursor pointing at *older* messages, which is the
 * only direction this list ever grows in.
 */
export function ConversationTranscriptPanel({
  conversationId,
}: ConversationTranscriptPanelProps) {
  const t = useTranslations('conversations.transcript');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const transcriptQuery = useConversationTranscript(conversationId);
  const transcript = transcriptQuery.transcript;

  function handleResult(message: string): void {
    setError(null);
    setNotice(message);
  }

  function handleError(message: string): void {
    setNotice(null);
    setError(message);
  }

  if (transcriptQuery.isLoading) {
    return <p className="p-6 text-sm text-slate-500">{t('loading')}</p>;
  }
  if (transcriptQuery.isError || transcript === undefined) {
    return <p className="p-6 text-sm text-red-700">{t('error')}</p>;
  }

  const conversation = transcript.conversation;
  const orderedMessages = [...transcript.items].reverse();

  return (
    <div className="space-y-6">
      <PageHeader
        title={conversation.senderDisplayName ?? t('unnamed')}
        subtitle={`${conversation.channel} · ${conversation.externalChatId}`}
        breadcrumbs={[t('breadcrumbs.assistant'), t('breadcrumbs.conversations')]}
        actions={
          <ConversationHandoffActions
            conversation={conversation}
            onResult={handleResult}
            onFailed={handleError}
          />
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <ConversationStateBadge
          state={conversation.state}
          isBlocked={conversation.isBlocked}
        />
        <Link
          href="/admin/conversations"
          className="text-sm text-slate-600 underline-offset-4 hover:underline"
        >
          {t('backToInbox')}
        </Link>
      </div>
      {notice ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
      ) : null}
      <Card>
        <CardContent className="space-y-3 p-5">
          {transcript.nextCursor === null ? null : (
            // Said plainly rather than paginated: this screen exists to answer
            // "what is happening now", and a conversation long enough to page
            // is one to read in full elsewhere.
            <p className="text-xs text-slate-500">{t('olderTurnsHidden')}</p>
          )}
          {orderedMessages.length === 0 ? (
            <p className="text-sm text-slate-500">{t('empty')}</p>
          ) : (
            <ul className="space-y-3">
              {orderedMessages.map((message) => (
                <ConversationTranscriptMessage key={message.id} message={message} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <ConversationReplyForm
            conversationId={conversationId}
            state={conversation.state}
            isBlocked={conversation.isBlocked}
            onFailed={handleError}
          />
        </CardContent>
      </Card>
    </div>
  );
}
