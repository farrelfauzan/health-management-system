'use client';

import { useTranslations } from 'next-intl';

import { useOptionalAiAssistant } from '#lib/ai-assistant/ai-assistant-context';
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
 */
export function useNavBadge(badgeKey: ShellNavBadgeKey | undefined): NavBadge | null {
  const t = useTranslations('aiAssistant.unread');
  const assistant = useOptionalAiAssistant();
  if (badgeKey !== 'aiAssistantUnread' || assistant === null || assistant.unreadCount === 0) {
    return null;
  }
  return { count: assistant.unreadCount, label: t('label', { count: assistant.unreadCount }) };
}
