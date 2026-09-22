'use client';

import type { NonCapitationClaimStatusValue } from '@hms/shared-types';
import { cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { NON_CAPITATION_STATUS_CLASSES } from '#lib/bpjs-non-capitation/non-capitation-status-classes';

type NonCapitationStatusChipProps = {
  status: NonCapitationClaimStatusValue;
};

/** A recap line's claim status as a coloured chip (P25-T16). */
export function NonCapitationStatusChip({ status }: NonCapitationStatusChipProps) {
  const t = useTranslations('operations.integrations.nonCapitation.statuses');

  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        NON_CAPITATION_STATUS_CLASSES[status],
      )}
    >
      {t(status)}
    </span>
  );
}
