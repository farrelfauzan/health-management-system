'use client';

import { useState } from 'react';
import type { ChannelKindValue, ConversationInboxFilterValue } from '@hms/shared-types';
import { Card, CardContent } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ChannelMetricsCard } from '#components/client/conversations/channel-metrics-card';
import { ConversationHandoffSummaryCard } from '#components/client/conversations/conversation-handoff-summary-card';
import {
  CONVERSATION_CHANNEL_ALL,
  ConversationInboxFilters,
} from '#components/client/conversations/conversation-inbox-filters';
import { ConversationsTable } from '#components/client/conversations/conversations-table';
import { PageHeader } from '#components/shared/page-header';
import { useConversations } from '#lib/conversations/use-conversations';

/** Below this the API rejects the search rather than matching everything. */
const MIN_SEARCH_LENGTH = 2;

/**
 * The channel inbox (`PCS-T08`, strategy §4.2).
 *
 * Opens on `HANDOFF` rather than on `ALL`, and that default is the screen's
 * only real opinion. The list of every conversation the bot has ever had is
 * a reporting view; the reason an admin comes here is that someone is waiting
 * for a person, and a screen that makes them apply a filter before showing
 * them the queue is a screen whose queue gets checked less often.
 */
export function ConversationInboxPanel() {
  const t = useTranslations('conversations');
  const [filter, setFilter] = useState<ConversationInboxFilterValue>('HANDOFF');
  const [channel, setChannel] = useState<ChannelKindValue | typeof CONVERSATION_CHANNEL_ALL>(
    CONVERSATION_CHANNEL_ALL,
  );
  const [search, setSearch] = useState('');
  const conversationsQuery = useConversations({
    filter,
    ...(channel === CONVERSATION_CHANNEL_ALL ? {} : { channel }),
    ...(search.trim().length >= MIN_SEARCH_LENGTH ? { search: search.trim() } : {}),
  });
  const rows = conversationsQuery.conversations;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('header.title')}
        subtitle={t('header.subtitle')}
        breadcrumbs={[t('header.breadcrumbs.assistant'), t('header.breadcrumbs.conversations')]}
      />
      <ConversationHandoffSummaryCard />
      {/* §8.4's metrics, under the live queue rather than above it: the queue
          is what an admin acts on minute to minute, and these are the
          fortnight numbers the rollout gate reads. Renders nothing while
          loading or on error — a dashboard must never block the inbox. */}
      <ChannelMetricsCard />
      <ConversationInboxFilters
        filter={filter}
        channel={channel}
        search={search}
        onFilterChange={setFilter}
        onChannelChange={setChannel}
        onSearchChange={setSearch}
      />
      <Card>
        <CardContent className="p-0">
          {conversationsQuery.isLoading ? (
            <p className="p-6 text-sm text-slate-500">{t('states.loading')}</p>
          ) : conversationsQuery.isError ? (
            <p className="p-6 text-sm text-red-700">{t('states.error')}</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">{t('states.empty')}</p>
          ) : (
            <ConversationsTable conversations={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
