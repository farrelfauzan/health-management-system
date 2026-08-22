'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { WardResponse } from '@hms/shared-types';
import { Button, Card, CardContent, Icon, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { WardFormDialog } from '#components/client/rooms/ward-form-dialog';
import { WardsTable } from '#components/client/rooms/wards-table';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { notifyApiError } from '#lib/api/notify-api-error';
import { wardControllerRetireWardV1 } from '#lib/api/generated/room-management/room-management';
import { ROOM_INVENTORY_PAGE_SIZE } from '#lib/rooms/page-size';
import { invalidateRoomQueries } from '#lib/rooms/invalidate-room-queries';
import { useWardsList } from '#lib/rooms/use-wards-list';

type WardDialogState = {
  isOpen: boolean;
  ward: WardResponse | null;
};

export function WardsPanel() {
  const t = useTranslations('operations');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const [page, setPage] = useState<number>(1);
  const [dialogState, setDialogState] = useState<WardDialogState>({ isOpen: false, ward: null });
  const wardsQuery = useWardsList({ page, limit: ROOM_INVENTORY_PAGE_SIZE });
  const canCreate = ability.can('create', 'Ward');
  const canUpdate = ability.can('update', 'Ward');
  const canDelete = ability.can('delete', 'Ward');

  async function handleRetire(ward: WardResponse): Promise<void> {
    try {
      await wardControllerRetireWardV1(ward.id);
      await invalidateRoomQueries(queryClient);
    } catch (error) {
      // Retiring a ward that still holds rooms is refused by the API with a
      // 409 rather than cascading, so the message is the whole feedback.
      notifyApiError(error, t('rooms.retireError'));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t('rooms.subtitle')}</p>
        {canCreate ? (
          <Button
            type="button"
            size="sm"
            className="bg-primary-container hover:bg-primary"
            onClick={() => setDialogState({ isOpen: true, ward: null })}
          >
            <Icon name="add" size={18} />
            {t('rooms.newWard')}
          </Button>
        ) : null}
      </div>

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <WardsTable
            wards={wardsQuery.wards}
            isPending={wardsQuery.isPending}
            isError={wardsQuery.isError}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onEdit={(ward) => setDialogState({ isOpen: true, ward })}
            onRetire={(ward) => void handleRetire(ward)}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={page}
            pageSize={ROOM_INVENTORY_PAGE_SIZE}
            total={wardsQuery.meta?.total ?? 0}
            itemLabel="wards"
            isDisabled={wardsQuery.isFetching}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      {dialogState.isOpen ? (
        <WardFormDialog
          key={dialogState.ward?.id ?? 'new'}
          open={dialogState.isOpen}
          ward={dialogState.ward}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setDialogState({ isOpen: false, ward: null });
            }
          }}
        />
      ) : null}
    </div>
  );
}
