'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostnatalSubjectValue } from '@hms/shared-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Icon, Skeleton } from '@hms/ui';
import { toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PostnatalExaminationForm } from '#components/client/maternal-care/postnatal-examination-form';
import { postnatalVisitControllerLinkVisitV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';
import { useEncounterPostnatalVisit } from '#lib/maternal-care/use-encounter-postnatal-visit';

type EncounterPostnatalCardProps = {
  encounterId: string;
  isEditable: boolean;
};

/**
 * The nifas / neonatal line in the encounter workspace (P25-T12): which KF or
 * KN window this visit falls in — "di luar jendela" when none — and, for the
 * mother's visit, the nifas examination. Unlinked, it offers both kinds; the
 * API refuses the one that does not fit this patient.
 */
export function EncounterPostnatalCard({ encounterId, isEditable }: EncounterPostnatalCardProps) {
  const t = useTranslations('maternalCare.postnatal');
  const queryClient = useQueryClient();
  const visitQuery = useEncounterPostnatalVisit(encounterId, true);
  const visit = visitQuery.visit;

  const mutation = useMutation({
    mutationFn: async (subject: PostnatalSubjectValue) =>
      postnatalVisitControllerLinkVisitV1(encounterId, { subject }),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('encounterCard.linkedToast'));
    },
    onError: (error) => notifyApiError(error, t('encounterCard.linkFailed')),
  });

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">{t('encounterCard.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {visitQuery.isPending ? <Skeleton className="h-10 w-full" /> : null}
        {!visitQuery.isPending && visit !== null ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-900">
              {t(`encounterCard.subjects.${visit.subject}`)} ·{' '}
              {visit.visitCode ?? t('encounterCard.outsideWindow')}
            </p>
            <p className="text-xs text-slate-500">
              {visit.isCodeFrozen ? t('encounterCard.frozen') : t('encounterCard.provisional')}
            </p>
          </div>
        ) : null}
        {!visitQuery.isPending && visit === null ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{t('encounterCard.notLinked')}</p>
            {isEditable ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate('MOTHER')}
                >
                  <Icon name="pregnant_woman" size={16} />
                  {t('encounterCard.linkMother')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate('NEWBORN')}
                >
                  <Icon name="child_care" size={16} />
                  {t('encounterCard.linkNewborn')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {visit !== null && visit.subject === 'MOTHER' ? (
          <PostnatalExaminationForm
            key={visit.id}
            encounterId={encounterId}
            examination={visit.examination}
            isEditable={isEditable}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
