'use client';

import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Icon, Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DiscontinueFamilyPlanningDialog } from '#components/client/maternal-care/discontinue-family-planning-dialog';
import { FamilyPlanningCourseCard } from '#components/client/maternal-care/family-planning-course-card';
import { FamilyPlanningHistoryRow } from '#components/client/maternal-care/family-planning-history-row';
import { FamilyPlanningPostDeliveryPrompt } from '#components/client/maternal-care/family-planning-post-delivery-prompt';
import { RecordFamilyPlanningServiceDialog } from '#components/client/maternal-care/record-family-planning-service-dialog';
import { StartFamilyPlanningDialog } from '#components/client/maternal-care/start-family-planning-dialog';
import { EmptyState } from '#components/shared/empty-state';
import { useOwnDoctorProfile } from '#lib/doctor-profile/use-own-doctor-profile';
import { usePatientFamilyPlanning } from '#lib/maternal-care/use-patient-family-planning';

type FamilyPlanningPanelProps = {
  patientId: string;
};

/**
 * The KB tab (P25-T14): the live course with its follow-ups, the way to start
 * one — as KB pasca salin when she gave birth recently — and earlier courses.
 */
export function FamilyPlanningPanel({ patientId }: FamilyPlanningPanelProps) {
  const t = useTranslations();
  const recordQuery = usePatientFamilyPlanning(patientId, true);
  // The provider defaults to the clinician recording it, like the delivery
  // attendant (P25-T09).
  const ownProfileQuery = useOwnDoctorProfile();
  const [startDeliveryRecordId, setStartDeliveryRecordId] = useState<string | null>(null);
  const [isStartDialogOpen, setIsStartDialogOpen] = useState<boolean>(false);
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState<boolean>(false);
  const [isDiscontinueDialogOpen, setIsDiscontinueDialogOpen] = useState<boolean>(false);
  const record = recordQuery.record;
  const liveCourse = record?.liveCourse ?? null;
  const pastCourses = (record?.courses ?? []).filter((course) => !course.isLive);

  function openStartDialog(deliveryRecordId: string | null): void {
    setStartDeliveryRecordId(deliveryRecordId);
    setIsStartDialogOpen(true);
  }

  if (recordQuery.isPending) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      {record?.postDeliveryCandidate ? (
        <FamilyPlanningPostDeliveryPrompt
          candidate={record.postDeliveryCandidate}
          onStart={(deliveryRecordId) => openStartDialog(deliveryRecordId)}
        />
      ) : null}

      {liveCourse === null ? (
        <EmptyState
          icon="family_restroom"
          title={
            recordQuery.isError
              ? t('maternalCare.familyPlanning.loadError')
              : t('maternalCare.familyPlanning.empty.title')
          }
          description={t('maternalCare.familyPlanning.empty.description')}
          action={
            <Button type="button" onClick={() => openStartDialog(null)}>
              <Icon name="add" size={18} />
              {t('maternalCare.familyPlanning.actions.start')}
            </Button>
          }
        />
      ) : (
        <FamilyPlanningCourseCard
          course={liveCourse}
          onRecordService={() => setIsServiceDialogOpen(true)}
          onDiscontinue={() => setIsDiscontinueDialogOpen(true)}
        />
      )}

      <Card className="rounded-xl border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t('maternalCare.familyPlanning.history')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pastCourses.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {pastCourses.map((course) => (
                <FamilyPlanningHistoryRow key={course.id} course={course} />
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
              {t('maternalCare.familyPlanning.historyEmpty')}
            </p>
          )}
        </CardContent>
      </Card>

      {isStartDialogOpen && ownProfileQuery.data ? (
        <StartFamilyPlanningDialog
          open={isStartDialogOpen}
          onOpenChange={setIsStartDialogOpen}
          patientId={patientId}
          providerDoctorId={ownProfileQuery.data.id}
          deliveryRecordId={startDeliveryRecordId}
        />
      ) : null}

      {isServiceDialogOpen && liveCourse !== null ? (
        <RecordFamilyPlanningServiceDialog
          open={isServiceDialogOpen}
          onOpenChange={setIsServiceDialogOpen}
          familyPlanningRecordId={liveCourse.id}
          method={liveCourse.method}
        />
      ) : null}

      {isDiscontinueDialogOpen && liveCourse !== null ? (
        <DiscontinueFamilyPlanningDialog
          open={isDiscontinueDialogOpen}
          onOpenChange={setIsDiscontinueDialogOpen}
          familyPlanningRecordId={liveCourse.id}
        />
      ) : null}
    </div>
  );
}
