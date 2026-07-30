'use client';

import { Button, Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { StatCard } from '#components/shared/stat-card';
import { LOW_STOCK_THRESHOLD } from '#lib/pharmacy/low-stock';
import { MOCK_INVENTORY_STATS } from '#lib/pharmacy/mock-inventory-stats';

type PharmacyStatCardsProps = {
  pendingTotal: number | undefined;
  isPendingLoading: boolean;
  isPendingError: boolean;
  lowStockCount: number | undefined;
  medicationsTotal: number | undefined;
  isStockLoading: boolean;
  isStockError: boolean;
  onViewFullQueue: () => void;
};

export function PharmacyStatCards({
  pendingTotal,
  isPendingLoading,
  isPendingError,
  lowStockCount,
  medicationsTotal,
  isStockLoading,
  isStockError,
  onViewFullQueue,
}: PharmacyStatCardsProps) {
  const t = useTranslations('operations.pharmacy');
  const lowStockProgress =
    medicationsTotal && medicationsTotal > 0 ? ((lowStockCount ?? 0) / medicationsTotal) * 100 : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon="inventory_2"
        label={t('inventoryValue')}
        value={MOCK_INVENTORY_STATS.totalInventoryValue}
        helper={t('inventoryTrend')}
      />
      {isStockLoading ? (
        <Skeleton data-testid="stat-skeleton-low-stock" className="h-36 rounded-xl" />
      ) : (
        <StatCard
          icon="priority_high"
          label={t('lowStock')}
          value={isStockError ? '—' : t('medications', { count: lowStockCount ?? 0 })}
          helper={isStockError ? t('unable') : t('stockUnits', { count: LOW_STOCK_THRESHOLD })}
          progress={isStockError ? undefined : lowStockProgress}
          variant="danger"
        />
      )}
      <StatCard
        icon="history"
        label={t('expiring')}
        value={t('items', { count: MOCK_INVENTORY_STATS.expiringSoonCount })}
        helper={t('lastAudit', { time: t('elapsedHours', { hours: 2, minutes: 0 }) })}
      />
      {isPendingLoading ? (
        <Skeleton data-testid="stat-skeleton-pending-orders" className="h-36 rounded-xl" />
      ) : (
        <StatCard
          icon="local_pharmacy"
          label={t('pendingOrders')}
          value={isPendingError ? '—' : String(pendingTotal ?? 0)}
          helper={
            isPendingError ? (
              t('unable')
            ) : (
              <Button
                type="button"
                size="sm"
                className="bg-white/20 text-white hover:bg-white/30"
                onClick={onViewFullQueue}
              >
                {t('viewQueue')}
              </Button>
            )
          }
          variant="primary"
        />
      )}
    </div>
  );
}
