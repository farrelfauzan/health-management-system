'use client';

import { useState } from 'react';
import { Button, Icon, Skeleton } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { StartFamilyPlanningDialog } from '#components/client/maternal-care/start-family-planning-dialog';
import { useOwnDoctorProfile } from '#lib/doctor-profile/use-own-doctor-profile';
import { usePatientFamilyPlanning } from '#lib/maternal-care/use-patient-family-planning';

type PostnatalFamilyPlanningActionProps = {
  patientId: string;
  encounterId: string;
  isEditable: boolean;
};

/**
 * KB on the mother's KF visit (P25-T18). KB counselling is part of every nifas
 * visit, so the course is started right here, linked to her recent birth and
 * to this visit. A live course is shown instead; with no recent birth left to
 * claim, there is nothing to offer and the line stays out of the way.
 */
export function PostnatalFamilyPlanningAction({
  patientId,
  encounterId,
  isEditable,
}: PostnatalFamilyPlanningActionProps) {
  const t = useTranslations('maternalCare.familyPlanning');
  const format = useFormatter();
  const recordQuery = usePatientFamilyPlanning(patientId, true);
  const ownProfileQuery = useOwnDoctorProfile();
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const liveCourse = recordQuery.record?.liveCourse ?? null;
  const candidate = recordQuery.record?.postDeliveryCandidate ?? null;

  if (recordQuery.isPending) {
    return <Skeleton className="h-10 w-full" />;
  }
  if (liveCourse !== null) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
        {t('postnatalAction.liveCourse', {
          method: t(`methods.${liveCourse.method}`),
          date: format.dateTime(new Date(`${liveCourse.startedOn}T00:00:00`), {
            dateStyle: 'medium',
          }),
        })}
      </p>
    );
  }
  if (candidate === null) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-sm text-slate-700">{t('postnatalAction.prompt')}</p>
      {isEditable && ownProfileQuery.data ? (
        <Button type="button" size="sm" onClick={() => setIsDialogOpen(true)}>
          <Icon name="add" size={16} />
          {t('actions.startPostDelivery')}
        </Button>
      ) : null}
      {isDialogOpen && ownProfileQuery.data ? (
        <StartFamilyPlanningDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          patientId={patientId}
          providerDoctorId={ownProfileQuery.data.id}
          deliveryRecordId={candidate.deliveryRecordId}
          startEncounterId={encounterId}
        />
      ) : null}
    </div>
  );
}
