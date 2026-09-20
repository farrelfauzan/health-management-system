'use client';

import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Icon, Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AntenatalExaminationForm } from '#components/client/maternal-care/antenatal-examination-form';
import { AntenatalReferralBanner } from '#components/client/maternal-care/antenatal-referral-banner';
import { IssueReferralLetterDialog } from '#components/client/maternal-care/issue-referral-letter-dialog';
import { TenTChecklistList } from '#components/client/maternal-care/ten-t-checklist-list';
import { useAntenatalExamination } from '#lib/maternal-care/use-antenatal-examination';

type AntenatalExaminationCardProps = {
  encounterId: string;
  isEditable: boolean;
  /** False until the encounter is counted as an antenatal visit. */
  isAntenatalVisit: boolean;
};

/**
 * The 10T examination of this visit (P25-T07): the fields, the computed
 * checklist, the sourced referral prompts and the letter button.
 *
 * It renders nothing until the encounter is marked as an antenatal visit —
 * the API answers 409 before then, and a card offering a fundal height on an
 * ordinary consultation would be noise.
 */
export function AntenatalExaminationCard({
  encounterId,
  isEditable,
  isAntenatalVisit,
}: AntenatalExaminationCardProps) {
  const t = useTranslations('maternalCare.examination');
  const examinationQuery = useAntenatalExamination(encounterId, isAntenatalVisit);
  const [isReferralDialogOpen, setIsReferralDialogOpen] = useState<boolean>(false);

  if (!isAntenatalVisit) {
    return null;
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="font-heading text-base">{t('title')}</CardTitle>
        {isEditable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsReferralDialogOpen(true)}
          >
            <Icon name="forward_to_inbox" size={16} />
            {t('documents.referralLetter')}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {examinationQuery.isPending ? <Skeleton className="h-40 w-full" /> : null}
        {!examinationQuery.isPending && examinationQuery.examination !== null ? (
          <>
            <AntenatalReferralBanner
              encounterId={encounterId}
              rules={examinationQuery.examination.referralRules}
              isEditable={isEditable}
            />
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {t('checklistTitle')}
              </p>
              <TenTChecklistList checklist={examinationQuery.examination.checklist} />
            </div>
            {isEditable ? (
              <AntenatalExaminationForm
                encounterId={encounterId}
                examination={examinationQuery.examination.examination}
              />
            ) : null}
          </>
        ) : null}
      </CardContent>

      {isReferralDialogOpen ? (
        <IssueReferralLetterDialog
          open={isReferralDialogOpen}
          onOpenChange={setIsReferralDialogOpen}
          encounterId={encounterId}
        />
      ) : null}
    </Card>
  );
}
