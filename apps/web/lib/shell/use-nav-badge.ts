'use client';

import { useTranslations } from 'next-intl';

import { useOptionalAiAssistant } from '#lib/ai-assistant/ai-assistant-context';
import { useConversationHandoffSummary } from '#lib/conversations/use-conversation-handoff-summary';
import type { ShellNavBadgeKey } from '#lib/shell/nav-items';

export type NavBadge = {
  count: number;
  /** Spoken label — a bare number tells a screen reader nothing. */
  label: string;
};

/**
 * Resolves a nav item's badge from whichever feature owns the count. The slot
 * on `AdminNavItem` stays generic — the approval queue will want one too — but
 * the data source stays with the feature rather than leaking into the nav
 * table. Returns null when there is nothing to show, so the caller renders
 * nothing rather than a zero.
 *
 * Every source is read on every call, because hooks cannot be conditional. The
 * handoff query takes its own `enabled` flag rather than being skipped, so the
 * nav items that are *not* the conversation inbox do not each open a poll
 * against the customer-service API — the count is fetched once, by the one item
 * that displays it, and only for an admin whose grants let the item render at
 * all (`filterNavSections` removes it otherwise).
 */
export function useNavBadge(badgeKey: ShellNavBadgeKey | undefined): NavBadge | null {
  const t = useTranslations('aiAssistant.unread');
  const conversationT = useTranslations('conversations.badge');
  const assistant = useOptionalAiAssistant();
  const { summary } = useConversationHandoffSummary(badgeKey === 'conversationHandoff');

  if (badgeKey === 'conversationHandoff') {
    const waitingCount = summary?.needsHumanCount ?? 0;
    // Only `NEEDS_HUMAN` counts. A conversation a colleague has already taken
    // over is being handled, and badging it would ask the whole clinic to look
    // at work that is already somebody's.
    if (waitingCount === 0) {
      return null;
    }
    return {
      count: waitingCount,
      label: conversationT('label', { count: waitingCount }),
    };
  }
  if (badgeKey !== 'aiAssistantUnread' || assistant === null || assistant.unreadCount === 0) {
    return null;
  }
  return { count: assistant.unreadCount, label: t('label', { count: assistant.unreadCount }) };
}
