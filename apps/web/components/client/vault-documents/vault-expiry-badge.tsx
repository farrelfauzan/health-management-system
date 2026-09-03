'use client';

import type { VaultDocumentExpiryStatus } from '@hms/shared-types';
import { Badge, Icon, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

type VaultExpiryBadgeProps = {
  status: VaultDocumentExpiryStatus;
  expiresAt: string | null;
};

const STATUS_CLASSES: Record<VaultDocumentExpiryStatus, string> = {
  EXPIRED: 'bg-danger-tint text-danger',
  EXPIRING_SOON: 'bg-warning-tint text-warning',
  VALID: 'bg-success-tint text-success',
  NO_EXPIRY: 'bg-neutral-tint text-neutral',
};

const STATUS_ICONS: Record<VaultDocumentExpiryStatus, string> = {
  EXPIRED: 'event_busy',
  EXPIRING_SOON: 'schedule',
  VALID: 'event_available',
  NO_EXPIRY: 'remove',
};

/**
 * How near a document is to its expiry, on its own row (`P16-T18`).
 *
 * The visual half of the reminder the owner also gets in their bell feed: a
 * person who opens this page having ignored a notification should still see
 * which document it was about, without opening anything.
 */
export function VaultExpiryBadge({ status, expiresAt }: VaultExpiryBadgeProps) {
  const t = useTranslations('vault.expiry');

  return (
    <Badge
      data-tone={
        status === 'EXPIRED' ? 'danger' : status === 'EXPIRING_SOON' ? 'warning' : 'neutral'
      }
      className={cn(
        'gap-1 rounded-full border-transparent font-heading text-[11px] font-medium tracking-wide',
        STATUS_CLASSES[status],
      )}
    >
      <Icon name={STATUS_ICONS[status]} size={12} />
      {status === 'NO_EXPIRY' ? t('none') : t(`status.${status}`, { expiresAt: expiresAt ?? '' })}
    </Badge>
  );
}
