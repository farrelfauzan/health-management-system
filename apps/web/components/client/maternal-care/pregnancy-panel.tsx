'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@hms/ui';
import { Button, Icon, Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AntenatalVisitList } from '#components/client/maternal-care/antenatal-visit-list';
import { DeliveryCard } from '#components/client/maternal-care/delivery-card';
import { EndPregnancyEpisodeDialog } from '#components/client/maternal-care/end-pregnancy-episode-dialog';
import { ExternalDoctorVisitCard } from '#components/client/maternal-care/external-doctor-visit-card';
import { PregnancyEpisodeHeaderCard } from '#components/client/maternal-care/pregnancy-episode-header-card';
import { RecordDeliveryDialog } from '#components/client/maternal-care/record-delivery-dialog';
import { RecordExternalDoctorVisitDialog } from '#components/client/maternal-care/record-external-doctor-visit-dialog';
import { RecordNewbornDialog } from '#components/client/maternal-care/record-newborn-dialog';
import { StartFamilyPlanningDialog } from '#components/client/maternal-care/start-family-planning-dialog';
import { StartPregnancyEpisodeDialog } from '#components/client/maternal-care/start-pregnancy-episode-dialog';
import { TrimesterScheduleCard } from '#components/client/maternal-care/trimester-schedule-card';
import { EmptyState } from '#components/shared/empty-state';
import { deliveryRecordControllerIssueBirthCertificateV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';
import { useOwnDoctorProfile } from '#lib/doctor-profile/use-own-doctor-profile';
import { useActivePregnancyEpisode } from '#lib/maternal-care/use-active-pregnancy-episode';
import { usePregnancyDelivery } from '#lib/maternal-care/use-pregnancy-delivery';

type PregnancyPanelProps = {
  patientId: string;
};

/** The Kehamilan tab (P25-T06): the running episode, or the way to open one. */
export function PregnancyPanel({ patientId }: PregnancyPanelProps) {
  const t = useTranslations();
  const episodeQuery = useActivePregnancyEpisode(patientId, true);
  const [isStartDialogOpen, setIsStartDialogOpen] = useState<boolean>(false);
  const [isEndDialogOpen, setIsEndDialogOpen] = useState<boolean>(false);
  const [isExternalVisitDialogOpen, setIsExternalVisitDialogOpen] = useState<boolean>(false);
  const [isDeliveryDialogOpen, setIsDeliveryDialogOpen] = useState<boolean>(false);
  const [isNewbornDialogOpen, setIsNewbornDialogOpen] = useState<boolean>(false);
  // P25-T14: the birth a "Mulai KB pasca salin" course is linked to.
  const [familyPlanningDeliveryId, setFamilyPlanningDeliveryId] = useState<string | null>(null);
  const episode = episodeQuery.episode;
  const queryClient = useQueryClient();
  const deliveryQuery = usePregnancyDelivery(episode?.episode.id ?? '', episode !== null);
  // The attendant defaults to the clinician recording it, which is who caught
  // the baby in almost every case. A birth attended by somebody else is
  // corrected on the record afterwards rather than guessed at here.
  const ownProfileQuery = useOwnDoctorProfile();
  const certificateMutation = useMutation({
    mutationFn: async (newbornCareRecordId: string) =>
      deliveryRecordControllerIssueBirthCertificateV1(newbornCareRecordId),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('maternalCare.delivery.actions.issueBirthCertificate'));
    },
    onError: (error) => notifyApiError(error, t('maternalCare.loadError')),
  });

  if (episodeQuery.isPending) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (episode === null) {
    return (
      <>
        <EmptyState
          icon="pregnant_woman"
          title={
            episodeQuery.isError ? t('maternalCare.loadError') : t('maternalCare.empty.title')
          }
          description={t('maternalCare.empty.description')}
          action={
            <Button type="button" onClick={() => setIsStartDialogOpen(true)}>
              <Icon name="add" size={18} />
              {t('maternalCare.actions.start')}
            </Button>
          }
        />
        {isStartDialogOpen ? (
          <StartPregnancyEpisodeDialog
            open={isStartDialogOpen}
            onOpenChange={setIsStartDialogOpen}
            patientId={patientId}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={() => setIsEndDialogOpen(true)}>
          <Icon name="event_busy" size={18} />
          {t('maternalCare.actions.end')}
        </Button>
      </div>
      <PregnancyEpisodeHeaderCard episode={episode} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <AntenatalVisitList visits={episode.visits} />
        <div className="min-w-0 space-y-6">
          <TrimesterScheduleCard schedule={episode.schedule} />
          <ExternalDoctorVisitCard
            visits={episode.externalDoctorVisits}
            onRecord={() => setIsExternalVisitDialogOpen(true)}
          />
        </div>
      </div>

      <DeliveryCard
        delivery={deliveryQuery.delivery}
        motherPatientId={patientId}
        onRecord={() => setIsDeliveryDialogOpen(true)}
        onRecordNewborn={() => setIsNewbornDialogOpen(true)}
        onIssueCertificate={(newbornCareRecordId) =>
          certificateMutation.mutate(newbornCareRecordId)
        }
        isIssuing={certificateMutation.isPending}
        onStartFamilyPlanning={setFamilyPlanningDeliveryId}
      />

      {isEndDialogOpen ? (
        <EndPregnancyEpisodeDialog
          open={isEndDialogOpen}
          onOpenChange={setIsEndDialogOpen}
          episodeId={episode.episode.id}
        />
      ) : null}

      {isExternalVisitDialogOpen ? (
        <RecordExternalDoctorVisitDialog
          open={isExternalVisitDialogOpen}
          onOpenChange={setIsExternalVisitDialogOpen}
          episodeId={episode.episode.id}
        />
      ) : null}

      {isDeliveryDialogOpen && ownProfileQuery.data ? (
        <RecordDeliveryDialog
          open={isDeliveryDialogOpen}
          onOpenChange={setIsDeliveryDialogOpen}
          episodeId={episode.episode.id}
          attendantDoctorId={ownProfileQuery.data?.id ?? ''}
        />
      ) : null}

      {familyPlanningDeliveryId !== null && ownProfileQuery.data ? (
        <StartFamilyPlanningDialog
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setFamilyPlanningDeliveryId(null);
            }
          }}
          patientId={patientId}
          providerDoctorId={ownProfileQuery.data.id}
          deliveryRecordId={familyPlanningDeliveryId}
        />
      ) : null}

      {isNewbornDialogOpen && deliveryQuery.delivery !== null ? (
        <RecordNewbornDialog
          open={isNewbornDialogOpen}
          onOpenChange={setIsNewbornDialogOpen}
          deliveryRecordId={deliveryQuery.delivery.id}
          recordedCount={deliveryQuery.delivery.newborns.length}
        />
      ) : null}
    </div>
  );
}
