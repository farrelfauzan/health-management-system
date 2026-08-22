'use client';

import type { RoomOccupancyResponse } from '@hms/shared-types';
import { TableCell, TableRow, cn } from '@hms/ui';

type OccupancyRoomRowProps = {
  room: RoomOccupancyResponse;
};

export function OccupancyRoomRow({ room }: OccupancyRoomRowProps) {
  const isFull = room.totalBeds > 0 && room.availableBeds === 0;

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3 font-mono text-sm text-slate-800">{room.code}</TableCell>
      <TableCell className="px-4 text-sm text-slate-800">{room.name}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {room.roomClass.name}
      </TableCell>
      <TableCell className="px-4 text-right text-sm text-slate-600">{room.totalBeds}</TableCell>
      <TableCell
        className={cn(
          'px-4 text-right text-sm font-medium',
          isFull ? 'text-danger' : 'text-success',
        )}
      >
        {room.availableBeds}
      </TableCell>
      <TableCell className="px-4 text-right text-sm text-slate-600">{room.occupiedBeds}</TableCell>
      <TableCell className="px-4 text-right text-sm text-slate-600">
        {room.maintenanceBeds}
      </TableCell>
    </TableRow>
  );
}
