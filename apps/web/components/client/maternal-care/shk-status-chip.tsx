'use client';

import type { ShkResultValue, ShkScreeningStatusValue } from '@hms/shared-types';
import { cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

type ShkStatusChipProps = {
  status: ShkScreeningStatusValue;
  result: ShkResultValue | null;
  sequence: number;
};

const STATUS_CLASS_NAMES: Record<ShkScreeningStatusValue, string> = {
  UPCOMING: 'bg-slate-100 text-slate-600',
  DUE: 'bg-info-tint text-info',
  OVERDUE: 'bg-danger-tint text-danger',
  TAKEN: 'bg-warning-tint text-warning-strong',
  SENT: 'bg-warning-tint text-warning-strong',
  RESULTED: 'bg-success-tint text-success-emphasis',
};

/**
 * Where one SHK sample stands (P25-T10). A resulted sample shows its answer
 * rather than "resulted", and a repeat sample says which one it is, because
 * "SHK due" on a baby already screened once reads like a mistake.
 */
export function ShkStatusChip({ status, result, sequence }: ShkStatusChipProps) {
  const t = useTranslations('maternalCare.shk');
  const label =
    status === 'RESULTED' && result !== null ? t(`results.${result}`) : t(`statuses.${status}`);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_CLASS_NAMES[status],
      )}
    >
      {t('chip', { label })}
      {sequence > 1 ? <span>{t('sequence', { sequence })}</span> : null}
    </span>
  );
}
