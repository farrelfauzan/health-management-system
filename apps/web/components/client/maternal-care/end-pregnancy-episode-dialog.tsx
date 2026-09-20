'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { pregnancyEpisodeControllerEndEpisodeV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';

type EndPregnancyEpisodeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  episodeId: string;
};

/**
 * "Akhiri episode" (P25-T06). Delivery is deliberately not one of the reasons:
 * a pregnancy that ended in a birth is closed by the delivery record, which
 * knows the baby.
 */
export function EndPregnancyEpisodeDialog({
  open,
  onOpenChange,
  episodeId,
}: EndPregnancyEpisodeDialogProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string>('LOST_TO_FOLLOW_UP');
  const [endedAt, setEndedAt] = useState<string>('');

  const mutation = useMutation({
    mutationFn: async () =>
      pregnancyEpisodeControllerEndEpisodeV1(episodeId, {
        reason: reason as 'MISCARRIAGE' | 'LOST_TO_FOLLOW_UP',
        endedAt: endedAt || undefined,
      }),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('maternalCare.end.submit'));
      onOpenChange(false);
    },
    onError: (error) => notifyApiError(error, t('maternalCare.loadError')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('maternalCare.end.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="end-reason">{t('maternalCare.end.reason')}</FormLabel>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="end-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MISCARRIAGE">
                  {t('maternalCare.end.reasons.MISCARRIAGE')}
                </SelectItem>
                <SelectItem value="LOST_TO_FOLLOW_UP">
                  {t('maternalCare.end.reasons.LOST_TO_FOLLOW_UP')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="ended-at">{t('maternalCare.end.endedAt')}</FormLabel>
            <DatePicker id="ended-at" value={endedAt} onValueChange={setEndedAt} />
            <p className="text-xs text-slate-500">{t('maternalCare.end.endedAtHint')}</p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('maternalCare.form.cancel')}
          </Button>
          <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {t('maternalCare.end.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
