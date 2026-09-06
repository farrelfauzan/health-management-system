'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import type { NotificationView } from '@hms/shared-types';
import { DropdownMenuItem, Icon, cn } from '@hms/ui';

const NOTIFICATION_TYPE_ICONS: Record<string, string> = {
  APPOINTMENT_APPROVED: 'event_available',
  APPOINTMENT_REJECTED: 'event_busy',
  CONVERSATION_HANDOFF: 'support_agent',
  VAULT_DOCUMENT_EXPIRING: 'schedule',
  VAULT_DOCUMENT_EXPIRED: 'event_busy',
  VAULT_DOCUMENT_SHARED: 'folder_shared',
  VAULT_DOCUMENT_OPENED: 'visibility',
  LICENCE_EXPIRING: 'gpp_maybe',
  LICENCE_EXPIRED: 'gpp_bad',
  PATIENT_DOCUMENT_RELEASED: 'lab_profile',
};

type NotificationsMenuItemProps = {
  notification: NotificationView;
};

export function NotificationsMenuItem({ notification }: NotificationsMenuItemProps) {
  const t = useTranslations('authShell.shell.notifications');
  const format = useFormatter();
  const router = useRouter();
  const isUnread = notification.readAt === null;
  const iconName = NOTIFICATION_TYPE_ICONS[notification.type] ?? 'notifications';
  // Rows carry i18n keys, so an older client can meet a key it does not know
  // yet; showing the raw key beats crashing the whole menu. The cast steps
  // around next-intl's literal-key typing, which cannot see server-sent keys.
  function resolveMessage(messageKey: string): string {
    const untypedTranslate = t as unknown as {
      (key: string, values?: Record<string, string>): string;
      has: (key: string) => boolean;
    };
    return untypedTranslate.has(messageKey)
      ? untypedTranslate(messageKey, notification.params)
      : messageKey;
  }
  function handleSelect(): void {
    if (notification.href) {
      router.push(notification.href);
    }
  }
  return (
    <DropdownMenuItem className="items-start gap-3 py-2.5" onSelect={handleSelect}>
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          isUnread ? 'bg-info-tint text-info' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon name={iconName} size={18} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-heading text-sm font-medium text-foreground">
          {resolveMessage(notification.titleKey)}
        </span>
        <span className="text-xs text-muted-foreground">
          {resolveMessage(notification.bodyKey)}
        </span>
        <span className="text-[11px] text-muted-foreground/70">
          {format.relativeTime(new Date(notification.createdAt))}
        </span>
      </span>
    </DropdownMenuItem>
  );
}
