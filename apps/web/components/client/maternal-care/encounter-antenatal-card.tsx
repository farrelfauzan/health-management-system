'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardContent, CardHeader, CardTitle, Icon, Skeleton, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AntenatalExaminationCard } from '#components/client/maternal-care/antenatal-examination-card';
import { pregnancyEpisodeControllerLinkEncounterVisitV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';
import { useEncounterAntenatalVisit } from '#lib/maternal-care/use-encounter-antenatal-visit';

type EncounterAntenatalCardProps = {
  encounterId: string;
  isEditable: boolean;
};

/**
 * The ANC line in the encounter workspace (P25-T06): what K-number this visit
 * is and how far along she is, or the button that counts it as one.
 *
 * The K-number is shown before the encounter closes, but it is not frozen
 * until it does — a visit opened today and backdated tomorrow renumbers, and
 * that is the honest reading rather than a number invented at open time.
 */
export function EncounterAntenatalCard({ encounterId, isEditable }: EncounterAntenatalCardProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const visitQuery = useEncounterAntenatalVisit(encounterId, true);
  const visit = visitQuery.visit;

  const mutation = useMutation({
    mutationFn: async () => pregnancyEpisodeControllerLinkEncounterVisitV1(encounterId),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('maternalCare.actions.markAntenatalVisit'));
    },
    onError: (error) => notifyApiError(error, t('maternalCare.encounterCard.noActiveEpisode')),
  });

  return (
    <>
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">
          {t('maternalCare.encounterCard.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {visitQuery.isPending ? <Skeleton className="h-10 w-full" /> : null}
        {!visitQuery.isPending && visit !== null ? (
          <p className="text-sm font-medium text-slate-900">
            {visit.visitCode === null
              ? t('maternalCare.encounterCard.uncodedLinked', {
                  ordinal: visit.ordinal,
                  weeks: visit.gestationalAge.weeks,
                })
              : t('maternalCare.encounterCard.linked', {
                  code: visit.visitCode,
                  weeks: visit.gestationalAge.weeks,
                })}
          </p>
        ) : null}
        {!visitQuery.isPending && visit === null ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{t('maternalCare.encounterCard.notLinked')}</p>
            {isEditable ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                <Icon name="pregnant_woman" size={16} />
                {t('maternalCare.actions.markAntenatalVisit')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
    {/* The 10T examination hangs off the same visit (P25-T07), so it appears
        the moment this encounter is counted as one and not before. */}
    <AntenatalExaminationCard
      encounterId={encounterId}
      isEditable={isEditable}
      isAntenatalVisit={visit !== null}
    />
    </>
  );
}
