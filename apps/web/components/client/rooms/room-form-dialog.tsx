'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateRoomInput, RoomResponse, UpdateRoomInput } from '@hms/shared-types';
import {
  Button,
  Checkbox,
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
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RoomClassSelect } from '#components/client/rooms/room-class-select';
import {
  roomControllerCreateRoomV1,
  roomControllerUpdateRoomV1,
} from '#lib/api/generated/room-management/room-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateRoomQueries } from '#lib/rooms/invalidate-room-queries';
import { useWardsList } from '#lib/rooms/use-wards-list';

const WARD_OPTIONS_LIMIT = 100;

type RoomFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: RoomResponse | null;
};

export function RoomFormDialog({ open, onOpenChange, room }: RoomFormDialogProps) {
  const t = useTranslations('operations');
  const queryClient = useQueryClient();
  const isEditing = room !== null;
  const wardsQuery = useWardsList({ page: 1, limit: WARD_OPTIONS_LIMIT, isActive: 'true' });
  const [wardId, setWardId] = useState<string>(room?.wardId ?? '');
  const [code, setCode] = useState<string>(room?.code ?? '');
  const [name, setName] = useState<string>(room?.name ?? '');
  const [roomClassId, setRoomClassId] = useState<string>(room?.roomClassId ?? '');
  const [isActive, setIsActive] = useState<boolean>(room?.isActive ?? true);
  const [actionError, setActionError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: CreateRoomInput | UpdateRoomInput) =>
      isEditing
        ? roomControllerUpdateRoomV1(room.id, payload as UpdateRoomInput)
        : roomControllerCreateRoomV1(payload as CreateRoomInput),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const trimmedName = name.trim();
    const trimmedCode = code.trim();

    if (
      trimmedName.length === 0 ||
      !roomClassId ||
      (!isEditing && (trimmedCode.length === 0 || !wardId))
    ) {
      setActionError(t('rooms.requiredFields'));
      return;
    }

    // Neither `code` nor `wardId` is updatable: a room that moves ward is a
    // different room, and every discharge summary already written names this
    // one where it was.
    const payload = isEditing
      ? { name: trimmedName, roomClassId, isActive }
      : { wardId, roomClassId, code: trimmedCode, name: trimmedName, isActive };

    try {
      parseApiSuccess(await saveMutation.mutateAsync(payload), t('rooms.saveError'));
      await invalidateRoomQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setActionError(notifyApiError(error, t('rooms.saveError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('rooms.editRoom') : t('rooms.newRoom')}</DialogTitle>
          <DialogDescription>
            {isEditing ? t('rooms.codeImmutable') : t('rooms.subtitle')}
          </DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="room-ward">{t('rooms.ward')}</Label>
            <Select value={wardId} onValueChange={setWardId} disabled={isEditing}>
              <SelectTrigger id="room-ward" className="w-full">
                <SelectValue placeholder={t('rooms.allWards')} />
              </SelectTrigger>
              <SelectContent>
                {wardsQuery.wards.map((ward) => (
                  <SelectItem key={ward.id} value={ward.id}>
                    {ward.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="room-code">{t('rooms.code')}</Label>
              <Input
                id="room-code"
                value={code}
                disabled={isEditing}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            <RoomClassSelect id="room-class" value={roomClassId} onChange={setRoomClassId} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="room-name">{t('rooms.name')}</Label>
            <Input id="room-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="room-active"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
            <Label htmlFor="room-active">{t('rooms.active')}</Label>
          </div>
          {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? t('common.saving') : t('rooms.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
