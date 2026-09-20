'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { antenatalExaminationControllerIssueReferralLetterV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';

type IssueReferralLetterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: string;
};

/**
 * "Buat surat rujukan" (FR-ANC-04). Only the destination and a free note are
 * asked for — the findings and the triggered rules are printed from the
 * record, so the letter cannot say something the visit does not.
 */
export function IssueReferralLetterDialog({
  open,
  onOpenChange,
  encounterId,
}: IssueReferralLetterDialogProps) {
  const t = useTranslations('maternalCare.examination.documents');
  const tForm = useTranslations('maternalCare.form');
  const queryClient = useQueryClient();
  const [destination, setDestination] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const mutation = useMutation({
    mutationFn: async () =>
      antenatalExaminationControllerIssueReferralLetterV1(encounterId, {
        destination,
        notes: notes || undefined,
      }),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('issued'));
      onOpenChange(false);
    },
    onError: (error) => notifyApiError(error, t('referralLetter')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('referralLetter')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="referral-destination" required>
              {t('destination')}
            </FormLabel>
            <Input
              id="referral-destination"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="referral-notes">{t('notes')}</FormLabel>
            <Input
              id="referral-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <p className="text-xs text-slate-500">{t('reissueHint')}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tForm('cancel')}
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || destination.trim().length === 0}
            onClick={() => mutation.mutate()}
          >
            {t('referralLetter')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
