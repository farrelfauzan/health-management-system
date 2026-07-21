'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  cn,
} from '@hms/ui';

import { MOCK_NOTIFICATIONS } from '#lib/shell/mock-notifications';

export function NotificationsMenu() {
  const hasUnread = MOCK_NOTIFICATIONS.some((notification) => notification.isUnread);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open notifications"
          className="relative rounded-full text-on-surface-variant hover:bg-surface-container-low"
        >
          <Icon name="notifications" size={22} />
          {hasUnread ? (
            <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-surface-container-lowest bg-error" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="font-heading">Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MOCK_NOTIFICATIONS.map((notification) => (
          <DropdownMenuItem key={notification.id} className="items-start gap-3 py-2.5">
            <span
              className={cn(
                'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                notification.isUnread
                  ? 'bg-info-tint text-info'
                  : 'bg-surface-container-low text-on-surface-variant',
              )}
            >
              <Icon name={notification.icon} size={18} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-heading text-sm font-medium text-on-surface">
                {notification.title}
              </span>
              <span className="text-xs text-on-surface-variant">{notification.description}</span>
              <span className="text-[11px] text-outline">{notification.timeLabel}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
