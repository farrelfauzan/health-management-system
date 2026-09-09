'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AmendLabResultInput,
  LabOrderItemView,
  LabResultView,
  LabTestView,
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
  Textarea,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { labResultControllerAmendLabResultV1 } from '#lib/api/generated/laboratory-results/laboratory-results';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateLabQueries } from '#lib/laboratory/invalidate-lab-queries';

const MAX_NOTE_LENGTH = 1_000;

export type LabAmendTarget = {
  result: LabResultView;
  item: LabOrderItemView;
  labTest: LabTestView | undefined;
};

type LabAmendDialogProps = {
  target: LabAmendTarget | null;
  onClose: () => void;
};

/**
 * Correcting a released value (`P18-T04`). The reason is mandatory and not a
 * formality: somebody may have treated a patient on the strength of the number
 * being replaced, and this sentence is what the amended report shows them.
 */
export function LabAmendDialog({ target, onClose }: LabAmendDialogProps) {
  const t = useTranslations('operations.laboratory.validation');
  const tCommon = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const [value, setValue] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const amendMutation = useMutation({
    mutationFn: (payload: AmendLabResultInput) =>
      labResultControllerAmendLabResultV1(target?.result.id ?? '', payload),
  });

  function handleClose(): void {
    setValue('');
    setReason('');
    setNote('');
    onClose();
  }

  async function handleConfirm(): Promise<void> {
    if (!target || reason.trim() === '' || value.trim() === '') {
      return;
    }
    try {
      const trimmedNote = note.trim();
      const response = await amendMutation.mutateAsync({
        ...toValuePayload(target.item, value),
        reason: reason.trim(),
        ...(trimmedNote === '' ? {} : { note: trimmedNote }),
      });
      parseApiSuccess<LabResultView>(response, t('amendError'));
      toast.success(t('amended'));
      await invalidateLabQueries(queryClient);
      handleClose();
    } catch (caughtError) {
      notifyApiError(caughtError, t('amendError'));
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? undefined : handleClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('amendTitle', { test: target?.item.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('amendDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label className="block space-y-1 text-sm text-slate-700 font-normal">
            {t('amendValue')}
            {target?.item.resultType === 'CODED' ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger>
                  <SelectValue placeholder={target.item.name} />
                </SelectTrigger>
                <SelectContent>
                  {(target.labTest?.codedOptions ?? []).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                inputMode={target?.item.resultType === 'NUMERIC' ? 'decimal' : 'text'}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                disabled={amendMutation.isPending}
              />
            )}
          </Label>
          <Label className="block space-y-1 text-sm text-slate-700 font-normal leading-normal">
            {t('amendReason')}
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('amendReasonPlaceholder')}
              disabled={amendMutation.isPending}
            />
          </Label>
          {/* P18-T14. The reason is the record's; the note is the sheet's —
              printed under the corrected results for whoever reads them. */}
          <Label className="block space-y-1 text-sm text-slate-700 font-normal leading-normal">
            {t('note')}
            <Textarea
              value={note}
              maxLength={MAX_NOTE_LENGTH}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('amendNotePlaceholder')}
              disabled={amendMutation.isPending}
              data-testid="lab-amend-note"
            />
          </Label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={amendMutation.isPending || reason.trim() === '' || value.trim() === ''}
          >
            {amendMutation.isPending ? t('amending') : t('amendConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toValuePayload(
  item: LabOrderItemView,
  raw: string,
): Pick<AmendLabResultInput, 'valueNumeric' | 'valueText' | 'valueCoded'> {
  if (item.resultType === 'NUMERIC') {
    return { valueNumeric: Number(raw.replace(',', '.')) };
  }
  if (item.resultType === 'CODED') {
    return { valueCoded: raw };
  }
  return { valueText: raw.trim() };
}
