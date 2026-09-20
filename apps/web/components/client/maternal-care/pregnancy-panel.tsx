'use client';

import { useState } from 'react';
import { Button, Icon, Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AntenatalVisitList } from '#components/client/maternal-care/antenatal-visit-list';
import { EndPregnancyEpisodeDialog } from '#components/client/maternal-care/end-pregnancy-episode-dialog';
import { ExternalDoctorVisitCard } from '#components/client/maternal-care/external-doctor-visit-card';
import { PregnancyEpisodeHeaderCard } from '#components/client/maternal-care/pregnancy-episode-header-card';
import { RecordExternalDoctorVisitDialog } from '#components/client/maternal-care/record-external-doctor-visit-dialog';
import { StartPregnancyEpisodeDialog } from '#components/client/maternal-care/start-pregnancy-episode-dialog';
import { TrimesterScheduleCard } from '#components/client/maternal-care/trimester-schedule-card';
import { EmptyState } from '#components/shared/empty-state';
import { useActivePregnancyEpisode } from '#lib/maternal-care/use-active-pregnancy-episode';

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
  const episode = episodeQuery.episode;

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
    </div>
  );
}
