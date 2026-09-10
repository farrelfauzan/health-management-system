'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SETTABLE_BED_STATUSES,
  type BedResponse,
  type CreateBedInput,
  type SettableBedStatusValue,
  type UpdateBedInput,
} from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { MissingParentNotice } from '#components/client/rooms/missing-parent-notice';
import {
  bedControllerCreateBedV1,
  bedControllerUpdateBedV1,
} from '#lib/api/generated/room-management/room-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateRoomQueries } from '#lib/rooms/invalidate-room-queries';
import { ROOM_OPTION_LIST_LIMIT } from '#lib/rooms/option-list-limit';
import { useRoomsList } from '#lib/rooms/use-rooms-list';
import { formatStatusLabel } from '#lib/shared/status-label';

type BedFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bed: BedResponse | null;
  onGoToRooms?: () => void;
};

export function BedFormDialog({ open, onOpenChange, bed, onGoToRooms }: BedFormDialogProps) {
  const t = useTranslations('operations');
  const queryClient = useQueryClient();
  const isEditing = bed !== null;
  const roomsQuery = useRoomsList({ page: 1, limit: ROOM_OPTION_LIST_LIMIT, isActive: 'true' });
  // Mirrors the room dialog: only a new bed can be stranded, and a failed
  // load is not "no rooms yet".
  const hasNoRooms = !isEditing && roomsQuery.isSuccess && roomsQuery.rooms.length === 0;
  const [roomId, setRoomId] = useState<string>(bed?.roomId ?? '');
  const [code, setCode] = useState<string>(bed?.code ?? '');
  const [status, setStatus] = useState<SettableBedStatusValue>(
    bed?.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'AVAILABLE',
  );
  const [notes, setNotes] = useState<string>(bed?.notes ?? '');
  const [actionError, setActionError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: CreateBedInput | UpdateBedInput) =>
      isEditing
        ? bedControllerUpdateBedV1(bed.id, payload as UpdateBedInput)
        : bedControllerCreateBedV1(payload as CreateBedInput),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const trimmedCode = code.trim();

    if (hasNoRooms) {
      setActionError(t('rooms.noRooms'));
      return;
    }

    if (!isEditing && (trimmedCode.length === 0 || !roomId)) {
      setActionError(t('rooms.requiredFields'));
      return;
    }

    const payload = isEditing
      ? { status, notes: notes.trim() || null }
      : {
          roomId,
          code: trimmedCode,
          status,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        };

    try {
      parseApiSuccess(await saveMutation.mutateAsync(payload), t('rooms.saveError'));
      await invalidateRoomQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setActionError(notifyApiError(error, t('rooms.saveError')));
    }
  }

  function handleGoToRooms(): void {
    onOpenChange(false);
    onGoToRooms?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('rooms.editBed') : t('rooms.newBed')}</DialogTitle>
          {/*
            OCCUPIED is absent from the status options on purpose: a bed being
            free is a claim about a patient, not about the furniture, and only
            admitting or discharging one may write it.
          */}
          <DialogDescription>{t('rooms.occupiedBedLocked')}</DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="bed-room">{t('rooms.room')}</Label>
            {roomsQuery.isPending ? (
              <Skeleton className="h-9 w-full" data-testid="bed-room-skeleton" />
            ) : null}
            {hasNoRooms ? (
              <MissingParentNotice
                message={t('rooms.noRooms')}
                actionLabel={onGoToRooms ? t('rooms.goToRooms') : undefined}
                onAction={handleGoToRooms}
              />
            ) : null}
            {!roomsQuery.isPending && !hasNoRooms ? (
              <Select value={roomId} onValueChange={setRoomId} disabled={isEditing}>
                <SelectTrigger id="bed-room" className="w-full">
                  <SelectValue placeholder={t('rooms.selectRoom')} />
                </SelectTrigger>
                <SelectContent>
                  {roomsQuery.rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.ward.name} / {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bed-code">{t('rooms.code')}</Label>
              <Input
                id="bed-code"
                value={code}
                disabled={isEditing}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bed-status">{t('rooms.status')}</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as SettableBedStatusValue)}
              >
                <SelectTrigger id="bed-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SETTABLE_BED_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {formatStatusLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bed-notes">{t('rooms.notes')}</Label>
            <Input
              id="bed-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || hasNoRooms}>
              {saveMutation.isPending ? t('common.saving') : t('rooms.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
