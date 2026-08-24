'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RoomResponse } from '@hms/shared-types';
import { Button, Card, CardContent, Icon, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RoomFormDialog } from '#components/client/rooms/room-form-dialog';
import { RoomsTable } from '#components/client/rooms/rooms-table';
import { WardFilterSelect } from '#components/client/rooms/ward-filter-select';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { roomControllerRetireRoomV1 } from '#lib/api/generated/room-management/room-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateRoomQueries } from '#lib/rooms/invalidate-room-queries';
import { ROOM_INVENTORY_PAGE_SIZE } from '#lib/rooms/page-size';
import { useRoomsList } from '#lib/rooms/use-rooms-list';

type RoomDialogState = {
  isOpen: boolean;
  room: RoomResponse | null;
};

export function RoomsPanel() {
  const t = useTranslations('operations');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const [page, setPage] = useState<number>(1);
  const [wardId, setWardId] = useState<string | undefined>(undefined);
  const [dialogState, setDialogState] = useState<RoomDialogState>({ isOpen: false, room: null });
  const roomsQuery = useRoomsList({
    page,
    limit: ROOM_INVENTORY_PAGE_SIZE,
    ...(wardId ? { wardId } : {}),
  });
  const canCreate = ability.can('create', 'Room');
  const canUpdate = ability.can('update', 'Room');
  const canDelete = ability.can('delete', 'Room');

  async function handleRetire(room: RoomResponse): Promise<void> {
    try {
      await roomControllerRetireRoomV1(room.id);
      await invalidateRoomQueries(queryClient);
    } catch (error) {
      notifyApiError(error, t('rooms.retireError'));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WardFilterSelect
          value={wardId}
          onChange={(nextWardId) => {
            setWardId(nextWardId);
            setPage(1);
          }}
        />
        {canCreate ? (
          <Button
            type="button"
            size="sm"
            className="bg-primary-container hover:bg-primary"
            onClick={() => setDialogState({ isOpen: true, room: null })}
          >
            <Icon name="add" size={18} />
            {t('rooms.newRoom')}
          </Button>
        ) : null}
      </div>

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <RoomsTable
            rooms={roomsQuery.rooms}
            isPending={roomsQuery.isPending}
            isError={roomsQuery.isError}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onEdit={(room) => setDialogState({ isOpen: true, room })}
            onRetire={(room) => void handleRetire(room)}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={page}
            pageSize={ROOM_INVENTORY_PAGE_SIZE}
            total={roomsQuery.meta?.total ?? 0}
            itemLabel="rooms"
            isDisabled={roomsQuery.isFetching}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      {dialogState.isOpen ? (
        <RoomFormDialog
          key={dialogState.room?.id ?? 'new'}
          open={dialogState.isOpen}
          room={dialogState.room}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setDialogState({ isOpen: false, room: null });
            }
          }}
        />
      ) : null}
    </div>
  );
}
