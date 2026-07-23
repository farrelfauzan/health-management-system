'use client';

import { Button, Skeleton } from '@hms/ui';

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
  const lowStockProgress =
    medicationsTotal && medicationsTotal > 0 ? ((lowStockCount ?? 0) / medicationsTotal) * 100 : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon="inventory_2"
        label="Total Inventory Value"
        value={MOCK_INVENTORY_STATS.totalInventoryValue}
        helper={MOCK_INVENTORY_STATS.inventoryTrend}
      />
      {isStockLoading ? (
        <Skeleton data-testid="stat-skeleton-low-stock" className="h-36 rounded-xl" />
      ) : (
        <StatCard
          icon="priority_high"
          label="Low Stock Alerts"
          value={isStockError ? '—' : `${lowStockCount ?? 0} Medications`}
          helper={
            isStockError ? 'Unable to load' : `At or below ${LOW_STOCK_THRESHOLD} units in stock`
          }
          progress={isStockError ? undefined : lowStockProgress}
          variant="danger"
        />
      )}
      <StatCard
        icon="history"
        label="Expiring Soon (<30d)"
        value={`${MOCK_INVENTORY_STATS.expiringSoonCount} Items`}
        helper={MOCK_INVENTORY_STATS.lastAuditLabel}
      />
      {isPendingLoading ? (
        <Skeleton data-testid="stat-skeleton-pending-orders" className="h-36 rounded-xl" />
      ) : (
        <StatCard
          icon="local_pharmacy"
          label="Pending Orders"
          value={isPendingError ? '—' : String(pendingTotal ?? 0)}
          helper={
            isPendingError ? (
              'Unable to load'
            ) : (
              <Button
                type="button"
                size="sm"
                className="bg-white/20 text-white hover:bg-white/30"
                onClick={onViewFullQueue}
              >
                View Full Queue
              </Button>
            )
          }
          variant="primary"
        />
      )}
    </div>
  );
}
