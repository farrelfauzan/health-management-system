'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { antenatalExaminationControllerIssueReferralLetterV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { useIssueClinicalDocument } from '#lib/clinical-documents/use-issue-clinical-document';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';

type IssueReferralLetterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: string;
};

/**
 * "Buat surat rujukan" (FR-ANC-04). Only the destination and a free note are
 * asked for — the findings and the triggered rules are printed from the
 * record, so the letter cannot say something the visit does not. The issued
 * PDF opens straight away, because the letter is what the patient carries.
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

  const referralLetter = useIssueClinicalDocument({
    issue: () =>
      antenatalExaminationControllerIssueReferralLetterV1(encounterId, {
        destination,
        notes: notes || undefined,
      }),
    readFromEncounterId: encounterId,
    successMessage: t('issued'),
    issueErrorMessage: t('issueError'),
    openErrorMessage: t('openError'),
    onIssued: async () => {
      await invalidateMaternalCareQueries(queryClient);
      onOpenChange(false);
    },
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
            disabled={referralLetter.isIssuing || destination.trim().length === 0}
            onClick={() => referralLetter.issueDocument()}
          >
            {t('referralLetter')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
