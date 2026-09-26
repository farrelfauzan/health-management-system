'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import type { NotificationView } from '@hms/shared-types';
import { DropdownMenuItem, Icon, cn } from '@hms/ui';

import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';
import { withDisplayNameFallbacks } from '#lib/notifications/with-display-name-fallbacks';

const NOTIFICATION_TYPE_ICONS: Record<string, string> = {
  APPOINTMENT_APPROVED: 'event_available',
  APPOINTMENT_REJECTED: 'event_busy',
  // P28. The clinic moved or cancelled a practice session the patient was in.
  APPOINTMENT_RESCHEDULED: 'event_repeat',
  APPOINTMENT_SESSION_CANCELLED: 'event_busy',
  CONVERSATION_HANDOFF: 'support_agent',
  VAULT_DOCUMENT_EXPIRING: 'schedule',
  VAULT_DOCUMENT_EXPIRED: 'event_busy',
  VAULT_DOCUMENT_SHARED: 'folder_shared',
  VAULT_DOCUMENT_OPENED: 'visibility',
  LICENCE_EXPIRING: 'gpp_maybe',
  LICENCE_EXPIRED: 'gpp_bad',
  // P25-T02. A midwife's delegated authority lapsing: the same pair of glyphs
  // as the licence, because to the administrator it is the same kind of chore.
  DOCTOR_AUTHORITY_EXPIRING: 'gpp_maybe',
  DOCTOR_AUTHORITY_EXPIRED: 'gpp_bad',
  PATIENT_DOCUMENT_RELEASED: 'lab_profile',
  // P18-T04. The critical value gets the alarm icon rather than the flask: the
  // point of the row is that somebody has to act now.
  LAB_RESULT_CRITICAL: 'priority_high',
  LAB_RESULT_RELEASED: 'biotech',
  DOCUMENT_APPROVAL_REQUESTED: 'approval',
  DOCUMENT_APPROVAL_APPROVED: 'task_alt',
  DOCUMENT_APPROVAL_REJECTED: 'cancel',
  DOCUMENT_APPROVAL_SUPERSEDED: 'undo',
  DOCUMENT_APPROVAL_DUE_SOON: 'schedule',
  DOCUMENT_APPROVAL_OVERDUE: 'alarm',
  BUG_REPORT_HELD: 'pause_circle',
  BUG_REPORT_PUBLISH_FAILED: 'sync_problem',
  // P25-T10. A baby called back for another SHK heel prick.
  SHK_RECALL: 'child_care',
  // D-048. Hand-offs between roles: work arriving at the bench, a patient
  // arriving for a clinician, a patient joining their care team, and a new
  // colleague accepting an invitation.
  LAB_ORDER_CREATED: 'science',
  PATIENT_CHECKED_IN: 'how_to_reg',
  PATIENT_ASSIGNED: 'person_add',
  CLINICIAN_JOINED: 'stethoscope',
  STAFF_JOINED: 'group_add',
};

/**
 * P18-T07. These deep-link into an encounter the doctor may already have
 * open, where a cached query would show the visit exactly as it was before the
 * value arrived — which is the one moment this feature exists to prevent.
 */
const ENCOUNTER_REFRESHING_TYPES: readonly string[] = [
  'LAB_RESULT_CRITICAL',
  'LAB_RESULT_RELEASED',
  'PATIENT_DOCUMENT_RELEASED',
];

type NotificationsMenuItemProps = {
  notification: NotificationView;
};

export function NotificationsMenuItem({ notification }: NotificationsMenuItemProps) {
  const t = useTranslations('authShell.shell.notifications');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  const queryClient = useQueryClient();
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
      ? untypedTranslate(messageKey, withDisplayNameFallbacks(notification.params))
      : messageKey;
  }
  function handleSelect(): void {
    if (!notification.href) {
      return;
    }
    if (ENCOUNTER_REFRESHING_TYPES.includes(notification.type)) {
      void invalidateEncounterQueries(queryClient);
    }
    router.push(notification.href);
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
          {format.relativeTime(new Date(notification.createdAt), now)}
        </span>
      </span>
    </DropdownMenuItem>
  );
}
