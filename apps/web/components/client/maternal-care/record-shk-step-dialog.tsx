'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ShkResultValue, ShkScreeningView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import {
  shkScreeningControllerRecordResultV1,
  shkScreeningControllerRecordSampleV1,
  shkScreeningControllerRecordSentV1,
} from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';
import type { ShkRowAction } from '#lib/maternal-care/shk-row-action';
import { toDatetimeLocalValue } from '#lib/maternal-care/to-datetime-local-value';
import { toInstant } from '#lib/maternal-care/to-instant';

type RecordShkStepDialogProps = {
  screening: ShkScreeningView;
  action: ShkRowAction;
  onOpenChange: (open: boolean) => void;
};

const SHK_RESULTS: readonly ShkResultValue[] = ['NORMAL', 'RECALL', 'INVALID_SAMPLE'];

/**
 * One step of one SHK sample (P25-T10): the heel prick, the card sent to the
 * laboratory, or the laboratory's answer. The time defaults to now and can be
 * moved back — the step is often written up after it happened.
 *
 * A RECALL or INVALID_SAMPLE answer opens the next sample on the server; the
 * worklist shows it as soon as the list is re-read.
 */
export function RecordShkStepDialog({ screening, action, onOpenChange }: RecordShkStepDialogProps) {
  const t = useTranslations('maternalCare.shk');
  const queryClient = useQueryClient();
  const [occurredAt, setOccurredAt] = useState<string>(toDatetimeLocalValue());
  const [laboratoryName, setLaboratoryName] = useState<string>('');
  const [result, setResult] = useState<ShkResultValue>('NORMAL');
  const [notes, setNotes] = useState<string>('');
  const isSubmittable =
    occurredAt.length > 0 && (action !== 'sent' || laboratoryName.trim().length > 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const instant = toInstant(occurredAt);
      if (action === 'sample') {
        return shkScreeningControllerRecordSampleV1(screening.id, { takenAt: instant });
      }
      if (action === 'sent') {
        return shkScreeningControllerRecordSentV1(screening.id, {
          sentAt: instant,
          laboratoryName: laboratoryName.trim(),
        });
      }
      return shkScreeningControllerRecordResultV1(screening.id, {
        receivedAt: instant,
        result,
        ...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
      });
    },
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t(`saved.${action}`));
      onOpenChange(false);
    },
    onError: (error) => notifyApiError(error, t('saveError')),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`actions.${action}`)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="shk-occurred-at" required>
              {t(`fields.${action}At`)}
            </FormLabel>
            <Input
              id="shk-occurred-at"
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </div>
          {action === 'sent' ? (
            <div className="space-y-2">
              <FormLabel htmlFor="shk-laboratory" required>
                {t('fields.laboratoryName')}
              </FormLabel>
              <Input
                id="shk-laboratory"
                value={laboratoryName}
                maxLength={200}
                onChange={(event) => setLaboratoryName(event.target.value)}
              />
            </div>
          ) : null}
          {action === 'result' ? (
            <>
              <div className="space-y-2">
                <FormLabel htmlFor="shk-result" required>
                  {t('fields.result')}
                </FormLabel>
                <Select value={result} onValueChange={(value) => setResult(value as ShkResultValue)}>
                  <SelectTrigger id="shk-result">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHK_RESULTS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`results.${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {result === 'NORMAL' ? null : (
                  <p className="text-xs text-warning-strong">{t('repeatHint')}</p>
                )}
              </div>
              <div className="space-y-2">
                <FormLabel htmlFor="shk-notes">{t('fields.notes')}</FormLabel>
                <Textarea
                  id="shk-notes"
                  value={notes}
                  maxLength={2000}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={!isSubmittable || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
