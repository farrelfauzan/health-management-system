'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  labSpecimenRejectReasonSchema,
  type LabSpecimenRejectReasonValue,
  type LabSpecimenView,
  type RejectLabSpecimenInput,
} from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { labSpecimenControllerRejectLabSpecimenV1 } from '#lib/api/generated/laboratory-specimens/laboratory-specimens';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateLabQueries } from '#lib/laboratory/invalidate-lab-queries';

type LabSpecimenRejectDialogProps = {
  specimen: LabSpecimenView | null;
  onClose: () => void;
};

/**
 * Sending a tube back (`P18-T08`). The reason is a fixed list because the
 * things that go wrong with a tube are a fixed list, and a count of
 * "haemolysed this month" is a question a lab lead eventually asks.
 */
export function LabSpecimenRejectDialog({ specimen, onClose }: LabSpecimenRejectDialogProps) {
  const t = useTranslations('operations.laboratory.specimens');
  const tCommon = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<LabSpecimenRejectReasonValue | ''>('');
  const [notes, setNotes] = useState<string>('');
  const rejectMutation = useMutation({
    mutationFn: (payload: RejectLabSpecimenInput) =>
      labSpecimenControllerRejectLabSpecimenV1(specimen?.id ?? '', payload),
  });

  function handleClose(): void {
    setReason('');
    setNotes('');
    onClose();
  }

  async function handleConfirm(): Promise<void> {
    if (reason === '') {
      return;
    }
    try {
      const response = await rejectMutation.mutateAsync({
        reason,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      parseApiSuccess<LabSpecimenView>(response, t('rejectError'));
      toast.success(t('rejected'));
      await invalidateLabQueries(queryClient);
      handleClose();
    } catch (caughtError) {
      notifyApiError(caughtError, t('rejectError'));
    }
  }

  return (
    <Dialog open={specimen !== null} onOpenChange={(open) => (open ? undefined : handleClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('rejectTitle', { accessionNumber: specimen?.accessionNumber ?? '' })}
          </DialogTitle>
          <DialogDescription>{t('rejectDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select
            value={reason}
            onValueChange={(value) => setReason(value as LabSpecimenRejectReasonValue)}
          >
            <SelectTrigger aria-label={t('reason')}>
              <SelectValue placeholder={t('reasonPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {labSpecimenRejectReasonSchema.options.map((candidate) => (
                <SelectItem key={candidate} value={candidate}>
                  {t(`reasons.${candidate}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t('notesPlaceholder')}
            disabled={rejectMutation.isPending}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={reason === '' || rejectMutation.isPending}
          >
            {rejectMutation.isPending ? t('rejecting') : t('confirmReject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
