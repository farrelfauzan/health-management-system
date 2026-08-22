'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateRoomClassInput,
  RoomClassResponse,
  UpdateRoomClassInput,
} from '@hms/shared-types';
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
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import {
  roomClassControllerCreateRoomClassV1,
  roomClassControllerUpdateRoomClassV1,
} from '#lib/api/generated/room-management/room-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateRoomQueries } from '#lib/rooms/invalidate-room-queries';

type RoomClassFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomClass: RoomClassResponse | null;
};

export function RoomClassFormDialog({
  open,
  onOpenChange,
  roomClass,
}: RoomClassFormDialogProps) {
  const t = useTranslations('operations');
  const queryClient = useQueryClient();
  const isEditing = roomClass !== null;
  const [code, setCode] = useState<string>(roomClass?.code ?? '');
  const [name, setName] = useState<string>(roomClass?.name ?? '');
  const [description, setDescription] = useState<string>(roomClass?.description ?? '');
  const [quota, setQuota] = useState<string>(
    roomClass?.quota === undefined ? '' : String(roomClass.quota),
  );
  const [isActive, setIsActive] = useState<boolean>(roomClass?.isActive ?? true);
  const [actionError, setActionError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: CreateRoomClassInput | UpdateRoomClassInput) =>
      isEditing
        ? roomClassControllerUpdateRoomClassV1(roomClass.id, payload as UpdateRoomClassInput)
        : roomClassControllerCreateRoomClassV1(payload as CreateRoomClassInput),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    const trimmedQuota = quota.trim();

    if (trimmedName.length === 0 || (!isEditing && trimmedCode.length === 0)) {
      setActionError(t('rooms.requiredFields'));
      return;
    }

    const parsedQuota = trimmedQuota.length === 0 ? null : Number(trimmedQuota);

    if (parsedQuota !== null && (!Number.isInteger(parsedQuota) || parsedQuota < 1)) {
      setActionError(t('rooms.quotaMustBePositive'));
      return;
    }

    // `code` is immutable: the accommodation tariff points at it, so renaming
    // it would re-point a price at nothing. An empty quota field sends `null`
    // on an update — that is how a clinic says "uncapped again" — and is simply
    // omitted on create, where there is nothing to clear.
    const payload = isEditing
      ? {
          name: trimmedName,
          description: description.trim() || null,
          quota: parsedQuota,
          isActive,
        }
      : {
          code: trimmedCode,
          name: trimmedName,
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(parsedQuota === null ? {} : { quota: parsedQuota }),
          isActive,
        };

    try {
      parseApiSuccess(await saveMutation.mutateAsync(payload), t('rooms.saveError'));
      await invalidateRoomQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      // Lowering a quota under the beds already allocated comes back as a 409
      // naming the count, which is more use than anything this form could say.
      setActionError(notifyApiError(error, t('rooms.saveError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('rooms.editRoomClass') : t('rooms.newRoomClass')}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? t('rooms.codeImmutable') : t('rooms.roomClassesSubtitle')}
          </DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="room-class-code">{t('rooms.code')}</Label>
              <Input
                id="room-class-code"
                value={code}
                disabled={isEditing}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="room-class-quota">{t('rooms.quota')}</Label>
              <Input
                id="room-class-quota"
                inputMode="numeric"
                placeholder={t('rooms.uncapped')}
                value={quota}
                onChange={(event) => setQuota(event.target.value)}
              />
              <p className="text-xs text-slate-400">{t('rooms.quotaHint')}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="room-class-name">{t('rooms.name')}</Label>
            <Input
              id="room-class-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="room-class-description">{t('rooms.description')}</Label>
            <Input
              id="room-class-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="room-class-active"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
            <Label htmlFor="room-class-active">{t('rooms.active')}</Label>
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
