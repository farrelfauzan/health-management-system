'use client';

import {
  CHANNEL_KINDS,
  CONVERSATION_INBOX_FILTERS,
  type ChannelKindValue,
  type ConversationInboxFilterValue,
} from '@hms/shared-types';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

/** The sentinel for "every channel", since a Select cannot hold `undefined`. */
export const CONVERSATION_CHANNEL_ALL = 'ALL';

type ConversationInboxFiltersProps = {
  filter: ConversationInboxFilterValue;
  channel: ChannelKindValue | typeof CONVERSATION_CHANNEL_ALL;
  search: string;
  onFilterChange: (value: ConversationInboxFilterValue) => void;
  onChannelChange: (value: ChannelKindValue | typeof CONVERSATION_CHANNEL_ALL) => void;
  onSearchChange: (value: string) => void;
};

/**
 * Queue, channel, and a name search.
 *
 * The search box is deliberately narrow in what it can reach: the API matches
 * the display name and the chat id and **not** the transcript. Offering a
 * message search here would be offering a full-text index over exactly the
 * text §5.3's redaction exists to avoid keeping — so the placeholder says what
 * it searches rather than letting an admin discover the limit by failing.
 */
export function ConversationInboxFilters({
  filter,
  channel,
  search,
  onFilterChange,
  onChannelChange,
  onSearchChange,
}: ConversationInboxFiltersProps) {
  const t = useTranslations('conversations.filters');

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-2">
        <Label htmlFor="conversation-filter-queue">{t('queue')}</Label>
        <Select
          value={filter}
          onValueChange={(value) => onFilterChange(value as ConversationInboxFilterValue)}
        >
          <SelectTrigger id="conversation-filter-queue" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONVERSATION_INBOX_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`queues.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="conversation-filter-channel">{t('channel')}</Label>
        <Select
          value={channel}
          onValueChange={(value) =>
            onChannelChange(value as ChannelKindValue | typeof CONVERSATION_CHANNEL_ALL)
          }
        >
          <SelectTrigger id="conversation-filter-channel" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CONVERSATION_CHANNEL_ALL}>{t('allChannels')}</SelectItem>
            {CHANNEL_KINDS.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="conversation-filter-search">{t('search')}</Label>
        <Input
          id="conversation-filter-search"
          value={search}
          placeholder={t('searchPlaceholder')}
          className="w-64"
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
    </div>
  );
}
