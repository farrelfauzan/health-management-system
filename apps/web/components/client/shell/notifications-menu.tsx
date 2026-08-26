'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  useAbility,
} from '@hms/ui';

import { NotificationsMenuItem } from '#components/client/shell/notifications-menu-item';
import { useMarkAllNotificationsRead } from '#lib/notifications/use-mark-all-notifications-read';
import { useNotificationUnreadCount } from '#lib/notifications/use-notification-unread-count';
import { useNotificationsList } from '#lib/notifications/use-notifications-list';

export function NotificationsMenu() {
  const t = useTranslations('authShell.shell.notifications');
  const ability = useAbility();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const canReadNotifications = ability.can('read', 'Notification');
  const canManageNotifications = ability.can('manage', 'Notification');
  const { unreadCount } = useNotificationUnreadCount(canReadNotifications);
  const { notifications, isFetched } = useNotificationsList(canReadNotifications && isOpen);
  const markAllReadMutation = useMarkAllNotificationsRead();
  function handleOpenChange(nextOpen: boolean): void {
    setIsOpen(nextOpen);
    // Opening the bell is the read receipt (IMP-21): the rows are on screen,
    // so the dot clears without asking for a second act. Unconditional on
    // open — gating on the polled count would race it.
    if (nextOpen && canManageNotifications) {
      markAllReadMutation.mutate();
    }
  }
  if (!canReadNotifications) {
    return null;
  }
  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('open')}
          className="relative rounded-full text-muted-foreground"
        >
          <Icon name="notifications" size={22} />
          {unreadCount > 0 ? (
            <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-card bg-destructive" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="font-heading">{t('title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isFetched && notifications.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : null}
        {notifications.map((notification) => (
          <NotificationsMenuItem key={notification.id} notification={notification} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
