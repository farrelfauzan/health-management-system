'use client';

import type { WardOccupancyResponse } from '@hms/shared-types';
import { Card, CardContent, TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { OccupancyRoomRow } from '#components/client/rooms/occupancy-room-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';

type OccupancyWardCardProps = {
  ward: WardOccupancyResponse;
};

/**
 * One ward, its rooms, and the four numbers that decide where the next patient
 * goes. A ward with no rooms is still drawn — the API returns it deliberately,
 * because omitting it would read as "no such ward" rather than "nothing in it
 * yet".
 */
export function OccupancyWardCard({ ward }: OccupancyWardCardProps) {
  const t = useTranslations('operations.rooms');

  return (
    <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-heading text-sm font-semibold text-slate-900">{ward.name}</p>
            <p className="font-mono text-xs text-slate-500">{ward.code}</p>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
            <div className="flex gap-1">
              <dt>{t('totalBeds')}</dt>
              <dd className="font-medium text-slate-900">{ward.totalBeds}</dd>
            </div>
            <div className="flex gap-1">
              <dt>{t('availableBeds')}</dt>
              <dd className="font-medium text-success">{ward.availableBeds}</dd>
            </div>
            <div className="flex gap-1">
              <dt>{t('occupiedBeds')}</dt>
              <dd className="font-medium text-slate-900">{ward.occupiedBeds}</dd>
            </div>
            <div className="flex gap-1">
              <dt>{t('maintenanceBeds')}</dt>
              <dd className="font-medium text-warning">{ward.maintenanceBeds}</dd>
            </div>
          </dl>
        </div>

        {ward.rooms.length === 0 ? (
          <p className="text-sm text-slate-500">{t('emptyRoomsInWard')}</p>
        ) : (
          <DataTable minWidthClassName="min-w-[44rem]">
            <TableHeader>
              <TableRow>
                <DataTableHeaderCell>{t('code')}</DataTableHeaderCell>
                <DataTableHeaderCell>{t('name')}</DataTableHeaderCell>
                <DataTableHeaderCell>{t('roomClass')}</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">{t('totalBeds')}</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">
                  {t('availableBeds')}
                </DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">
                  {t('occupiedBeds')}
                </DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">
                  {t('maintenanceBeds')}
                </DataTableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ward.rooms.map((room) => (
                <OccupancyRoomRow key={room.roomId} room={room} />
              ))}
            </TableBody>
          </DataTable>
        )}
      </CardContent>
    </Card>
  );
}
