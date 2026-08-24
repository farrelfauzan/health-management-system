'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RoomClassResponse } from '@hms/shared-types';
import { Button, Card, CardContent, Icon, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RoomClassFormDialog } from '#components/client/rooms/room-class-form-dialog';
import { RoomClassesTable } from '#components/client/rooms/room-classes-table';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { roomClassControllerRetireRoomClassV1 } from '#lib/api/generated/room-management/room-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateRoomQueries } from '#lib/rooms/invalidate-room-queries';
import { ROOM_INVENTORY_PAGE_SIZE } from '#lib/rooms/page-size';
import { useRoomClassesList } from '#lib/rooms/use-room-classes-list';

type RoomClassDialogState = {
  isOpen: boolean;
  roomClass: RoomClassResponse | null;
};

export function RoomClassesPanel() {
  const t = useTranslations('operations');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const [page, setPage] = useState<number>(1);
  const [dialogState, setDialogState] = useState<RoomClassDialogState>({
    isOpen: false,
    roomClass: null,
  });
  const roomClassesQuery = useRoomClassesList({ page, limit: ROOM_INVENTORY_PAGE_SIZE });
  const canCreate = ability.can('create', 'RoomClass');
  const canUpdate = ability.can('update', 'RoomClass');
  const canDelete = ability.can('delete', 'RoomClass');

  async function handleRetire(roomClass: RoomClassResponse): Promise<void> {
    try {
      await roomClassControllerRetireRoomClassV1(roomClass.id);
      await invalidateRoomQueries(queryClient);
    } catch (error) {
      notifyApiError(error, t('rooms.retireError'));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t('rooms.roomClassesSubtitle')}</p>
        {canCreate ? (
          <Button
            type="button"
            size="sm"
            className="bg-primary-container hover:bg-primary"
            onClick={() => setDialogState({ isOpen: true, roomClass: null })}
          >
            <Icon name="add" size={18} />
            {t('rooms.newRoomClass')}
          </Button>
        ) : null}
      </div>

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <RoomClassesTable
            roomClasses={roomClassesQuery.roomClasses}
            isPending={roomClassesQuery.isPending}
            isError={roomClassesQuery.isError}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onEdit={(roomClass) => setDialogState({ isOpen: true, roomClass })}
            onRetire={(roomClass) => void handleRetire(roomClass)}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={page}
            pageSize={ROOM_INVENTORY_PAGE_SIZE}
            total={roomClassesQuery.meta?.total ?? 0}
            itemLabel="classes"
            isDisabled={roomClassesQuery.isFetching}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      {dialogState.isOpen ? (
        <RoomClassFormDialog
          key={dialogState.roomClass?.id ?? 'new'}
          open={dialogState.isOpen}
          roomClass={dialogState.roomClass}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setDialogState({ isOpen: false, roomClass: null });
            }
          }}
        />
      ) : null}
    </div>
  );
}
