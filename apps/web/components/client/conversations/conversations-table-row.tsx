'use client';

import type { AdminConversationView } from '@hms/shared-types';
import { TableCell, TableRow } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { ConversationStateBadge } from '#components/client/conversations/conversation-state-badge';
import { ConversationWaitLabel } from '#components/client/conversations/conversation-wait-label';

type ConversationsTableRowProps = {
  conversation: AdminConversationView;
};

/**
 * One row of the inbox.
 *
 * There is no message preview, and that omission is upstream of this file: the
 * list endpoint does not return message bodies. A preview column would put
 * post-redaction customer text into every cached list response, every
 * screenshot of the queue, and every browser back-button render — for
 * conversations nobody chose to open. Reading a transcript is a click, and a
 * click is an act somebody performed.
 */
export function ConversationsTableRow({ conversation }: ConversationsTableRowProps) {
  const t = useTranslations('conversations.table');
  const format = useFormatter();

  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/admin/conversations/${conversation.id}`}
          className="font-medium text-slate-900 underline-offset-4 hover:underline"
        >
          {conversation.senderDisplayName ?? t('unnamed')}
        </Link>
        {/* The chat id is the only stable handle this channel has for a
            person: a display name is chosen by its owner and changes. */}
        <p className="text-xs text-slate-500">{conversation.externalChatId}</p>
      </TableCell>
      <TableCell className="text-sm text-slate-600">{conversation.channel}</TableCell>
      <TableCell>
        <ConversationStateBadge
          state={conversation.state}
          isBlocked={conversation.isBlocked}
        />
      </TableCell>
      <TableCell>
        <ConversationWaitLabel waitingForSeconds={conversation.waitingForSeconds} />
      </TableCell>
      <TableCell className="text-sm text-slate-600">{conversation.messageCount}</TableCell>
      <TableCell className="text-sm text-slate-600">
        {format.dateTime(new Date(conversation.lastMessageAt), {
          dateStyle: 'short',
          timeStyle: 'short',
        })}
      </TableCell>
    </TableRow>
  );
}
