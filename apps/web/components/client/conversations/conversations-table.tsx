'use client';

import type { AdminConversationView } from '@hms/shared-types';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ConversationsTableRow } from '#components/client/conversations/conversations-table-row';

type ConversationsTableProps = {
  conversations: AdminConversationView[];
};

export function ConversationsTable({ conversations }: ConversationsTableProps) {
  const t = useTranslations('conversations.table');

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columns.customer')}</TableHead>
          <TableHead>{t('columns.channel')}</TableHead>
          <TableHead>{t('columns.state')}</TableHead>
          <TableHead>{t('columns.waiting')}</TableHead>
          <TableHead>{t('columns.messages')}</TableHead>
          <TableHead>{t('columns.lastMessage')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {conversations.map((conversation) => (
          <ConversationsTableRow key={conversation.id} conversation={conversation} />
        ))}
      </TableBody>
    </Table>
  );
}
