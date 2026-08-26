import type { NotificationTypeValue } from '#notification/schemas';

/**
 * One row of the bell feed. `titleKey`/`bodyKey` are i18n message keys the web
 * shell resolves under `authShell.shell.notifications`, with `params` as the
 * ICU values — the API stores no rendered copy, so translations stay a
 * frontend concern.
 */
export type NotificationView = {
  id: string;
  type: NotificationTypeValue;
  titleKey: string;
  bodyKey: string;
  params: Record<string, string>;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsListMeta = {
  page: number;
  limit: number;
  total: number;
};

/**
 * Counts only, modelled on the cs-admin handoff summary: this endpoint is
 * polled by every open shell, so it must never return a list.
 */
export type NotificationUnreadCountView = {
  unreadCount: number;
};

export type NotificationsReadAllView = {
  updatedCount: number;
};
