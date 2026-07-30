'use client';

import type { InventorySummaryResponse } from '@hms/shared-types';
import { Skeleton } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { StatCard } from '#components/shared/stat-card';

type InventoryStatCardsProps = {
  summary: InventorySummaryResponse | undefined;
  expiringCount: number | undefined;
  isLoading: boolean;
  isError: boolean;
};

export function InventoryStatCards({
  summary,
  expiringCount,
  isLoading,
  isError,
}: InventoryStatCardsProps) {
  const t = useTranslations('pharmacyInventory');
  const format = useFormatter();

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} data-testid="inventory-stat-skeleton" className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }

  const helper = isError
    ? undefined
    : t('asOf', {
        date: summary?.asOfDate
          ? format.dateTime(new Date(`${summary.asOfDate}T00:00:00`), { dateStyle: 'medium' })
          : '-',
      });
  const value = (count: number | undefined): string =>
    isError ? '—' : format.number(count ?? 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon="medication" label={t('medications')} value={value(summary?.medicationCount)} helper={helper} />
      <StatCard icon="inventory_2" label={t('stockUnits')} value={value(summary?.totalStockQty)} helper={helper} />
      <StatCard
        icon="priority_high"
        label={t('reorderAlerts')}
        value={value(summary?.reorderCount)}
        helper={helper}
        variant="danger"
      />
      <StatCard icon="event_upcoming" label={t('expiringLots')} value={value(expiringCount)} helper={helper} />
    </div>
  );
}
