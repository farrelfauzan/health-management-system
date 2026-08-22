'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BedResponse } from '@hms/shared-types';
import { Button, Card, CardContent, Icon, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { BedFormDialog } from '#components/client/rooms/bed-form-dialog';
import { BedsTable } from '#components/client/rooms/beds-table';
import { WardFilterSelect } from '#components/client/rooms/ward-filter-select';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { bedControllerRetireBedV1 } from '#lib/api/generated/room-management/room-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateRoomQueries } from '#lib/rooms/invalidate-room-queries';
import { ROOM_INVENTORY_PAGE_SIZE } from '#lib/rooms/page-size';
import { useBedsList } from '#lib/rooms/use-beds-list';

type BedDialogState = {
  isOpen: boolean;
  bed: BedResponse | null;
};

export function BedsPanel() {
  const t = useTranslations('operations');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const [page, setPage] = useState<number>(1);
  const [wardId, setWardId] = useState<string | undefined>(undefined);
  const [dialogState, setDialogState] = useState<BedDialogState>({ isOpen: false, bed: null });
  const bedsQuery = useBedsList({
    page,
    limit: ROOM_INVENTORY_PAGE_SIZE,
    ...(wardId ? { wardId } : {}),
  });
  const canCreate = ability.can('create', 'Bed');
  const canUpdate = ability.can('update', 'Bed');
  const canDelete = ability.can('delete', 'Bed');

  async function handleRetire(bed: BedResponse): Promise<void> {
    try {
      await bedControllerRetireBedV1(bed.id);
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
            onClick={() => setDialogState({ isOpen: true, bed: null })}
          >
            <Icon name="add" size={18} />
            {t('rooms.newBed')}
          </Button>
        ) : null}
      </div>

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <BedsTable
            beds={bedsQuery.beds}
            isPending={bedsQuery.isPending}
            isError={bedsQuery.isError}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onEdit={(bed) => setDialogState({ isOpen: true, bed })}
            onRetire={(bed) => void handleRetire(bed)}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={page}
            pageSize={ROOM_INVENTORY_PAGE_SIZE}
            total={bedsQuery.meta?.total ?? 0}
            itemLabel="beds"
            isDisabled={bedsQuery.isFetching}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      {dialogState.isOpen ? (
        <BedFormDialog
          key={dialogState.bed?.id ?? 'new'}
          open={dialogState.isOpen}
          bed={dialogState.bed}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setDialogState({ isOpen: false, bed: null });
            }
          }}
        />
      ) : null}
    </div>
  );
}
