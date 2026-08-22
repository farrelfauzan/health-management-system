'use client';

import { Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { OccupancyWardCard } from '#components/client/rooms/occupancy-ward-card';
import { EmptyState } from '#components/shared/empty-state';
import { useRoomOccupancy } from '#lib/rooms/use-room-occupancy';

export function OccupancyPanel() {
  const t = useTranslations('operations.rooms');
  const occupancyQuery = useRoomOccupancy({});

  if (occupancyQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (occupancyQuery.isError || occupancyQuery.wards.length === 0) {
    return (
      <EmptyState
        icon={occupancyQuery.isError ? 'error' : 'king_bed'}
        title={occupancyQuery.isError ? t('loadError') : t('emptyOccupancy')}
        description={
          occupancyQuery.isError ? t('loadErrorDescription') : t('emptyOccupancyDescription')
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {occupancyQuery.wards.map((ward) => (
        <OccupancyWardCard key={ward.wardId} ward={ward} />
      ))}
    </div>
  );
}
