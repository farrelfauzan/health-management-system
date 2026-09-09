'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReleaseLabOrderInput } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { labResultControllerReleaseLabOrderV1 } from '#lib/api/generated/laboratory-results/laboratory-results';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateLabQueries } from '#lib/laboratory/invalidate-lab-queries';

const MAX_NOTE_LENGTH = 1_000;

type LabReleaseDialogProps = {
  labOrderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The second signature's one question (`P18-T14`): is there a sentence the
 * reader of this sheet needs? Optional, because most sheets need none, and
 * the placeholder says what the field is for rather than "Catatan" — the
 * note is printed under the results table and shown on the versions list,
 * so what goes in here reaches the patient.
 */
export function LabReleaseDialog({ labOrderId, open, onOpenChange }: LabReleaseDialogProps) {
  const t = useTranslations('operations.laboratory.validation');
  const tCommon = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string>('');
  const releaseMutation = useMutation({
    mutationFn: (payload: ReleaseLabOrderInput) =>
      labResultControllerReleaseLabOrderV1(labOrderId, payload),
  });

  function handleClose(): void {
    setNote('');
    onOpenChange(false);
  }

  async function handleConfirm(): Promise<void> {
    const trimmedNote = note.trim();
    try {
      parseApiSuccess(
        await releaseMutation.mutateAsync(trimmedNote === '' ? {} : { note: trimmedNote }),
        t('releaseError'),
      );
      toast.success(t('released'));
      await invalidateLabQueries(queryClient);
      handleClose();
    } catch (caughtError) {
      notifyApiError(caughtError, t('releaseError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => (isOpen ? undefined : handleClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('releaseTitle')}</DialogTitle>
          <DialogDescription>{t('releaseDescription')}</DialogDescription>
        </DialogHeader>
        <Label className="block space-y-1 text-sm text-slate-700 font-normal leading-normal">
          {t('note')}
          <Textarea
            value={note}
            maxLength={MAX_NOTE_LENGTH}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('notePlaceholder')}
            disabled={releaseMutation.isPending}
            data-testid="lab-release-note"
          />
        </Label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={releaseMutation.isPending}
            data-testid="lab-release-confirm"
          >
            {releaseMutation.isPending ? t('releasing') : t('releaseConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
