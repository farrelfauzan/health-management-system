'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateWardInput, UpdateWardInput, WardResponse } from '@hms/shared-types';
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

import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import {
  wardControllerCreateWardV1,
  wardControllerUpdateWardV1,
} from '#lib/api/generated/room-management/room-management';
import { invalidateRoomQueries } from '#lib/rooms/invalidate-room-queries';

type WardFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ward: WardResponse | null;
};

export function WardFormDialog({ open, onOpenChange, ward }: WardFormDialogProps) {
  const t = useTranslations('operations');
  const queryClient = useQueryClient();
  const isEditing = ward !== null;
  const [code, setCode] = useState<string>(ward?.code ?? '');
  const [name, setName] = useState<string>(ward?.name ?? '');
  const [description, setDescription] = useState<string>(ward?.description ?? '');
  const [isActive, setIsActive] = useState<boolean>(ward?.isActive ?? true);
  const [actionError, setActionError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: CreateWardInput | UpdateWardInput) =>
      isEditing
        ? wardControllerUpdateWardV1(ward.id, payload as UpdateWardInput)
        : wardControllerCreateWardV1(payload as CreateWardInput),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const trimmedName = name.trim();
    const trimmedCode = code.trim();

    if (trimmedName.length === 0 || (!isEditing && trimmedCode.length === 0)) {
      setActionError(t('rooms.requiredFields'));
      return;
    }

    // `code` is immutable: it is what the ward is called on the floor plan and
    // in every discharge summary already written, so an update never sends it.
    const payload = isEditing
      ? { name: trimmedName, description: description.trim() || null, isActive }
      : {
          code: trimmedCode,
          name: trimmedName,
          ...(description.trim() ? { description: description.trim() } : {}),
          isActive,
        };

    try {
      parseApiSuccess(await saveMutation.mutateAsync(payload), t('rooms.saveError'));
      await invalidateRoomQueries(queryClient);
      onOpenChange(false);
    } catch (err) {
      setActionError(notifyApiError(err, t('rooms.saveError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('rooms.editWard') : t('rooms.newWard')}</DialogTitle>
          <DialogDescription>
            {isEditing ? t('rooms.codeImmutable') : t('rooms.subtitle')}
          </DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="ward-code">{t('rooms.code')}</Label>
            <Input
              id="ward-code"
              value={code}
              disabled={isEditing}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ward-name">{t('rooms.name')}</Label>
            <Input id="ward-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ward-description">{t('rooms.description')}</Label>
            <Input
              id="ward-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="ward-active"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
            <Label htmlFor="ward-active">{t('rooms.active')}</Label>
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
