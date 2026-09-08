'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LabOrderView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { labOrderControllerCancelLabOrderV1 } from '#lib/api/generated/laboratory-orders/laboratory-orders';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';

type EncounterLabCancelDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labOrderId: string;
  orderNumber: string;
};

/**
 * Withdraws a request, with the reason the API insists on (`P18-T07`).
 *
 * Mandatory because "why was my test never run" is answered from this sentence
 * and nowhere else — and because the patient may already have been sent to the
 * counter for it. Once a tube exists the clinic has done work, so the button
 * that opens this dialog disappears at that point rather than failing here.
 */
export function EncounterLabCancelDialog({
  open,
  onOpenChange,
  labOrderId,
  orderNumber,
}: EncounterLabCancelDialogProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [reason, setReason] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const cancelMutation = useMutation({
    mutationFn: () => labOrderControllerCancelLabOrderV1(labOrderId, { reason: reason.trim() }),
  });

  async function handleConfirm(): Promise<void> {
    setActionError(null);
    if (!reason.trim()) {
      setActionError(t('encounters.laboratory.cancel.reasonRequired'));
      return;
    }
    try {
      const response = await cancelMutation.mutateAsync();
      parseApiSuccess<LabOrderView>(response, t('encounters.laboratory.cancel.error'));
      await invalidateEncounterQueries(queryClient);
      onOpenChange(false);
    } catch (caughtError) {
      setActionError(notifyApiError(caughtError, t('encounters.laboratory.cancel.error')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t('encounters.laboratory.cancel.title', { orderNumber })}
          </DialogTitle>
          <DialogDescription>{t('encounters.laboratory.cancel.description')}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('encounters.laboratory.cancel.reasonPlaceholder')}
          rows={3}
        />
        {actionError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {actionError}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('encounters.laboratory.cancel.keep')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={cancelMutation.isPending}
            onClick={() => void handleConfirm()}
          >
            {t(`encounters.laboratory.cancel.${cancelMutation.isPending ? 'pending' : 'confirm'}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
