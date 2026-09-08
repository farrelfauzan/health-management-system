'use client';

import type { PatientLabResultView } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabResultsGroup } from '#components/client/laboratory/lab-results-group';
import { groupLabResultsByOrder } from '#lib/laboratory/group-lab-results-by-order';

type EncounterLabResultsCardProps = {
  patientId: string;
  labResults: PatientLabResultView[];
};

/**
 * Hasil Lab: the values released on this visit, next to the vitals rather than
 * behind the order (`P18-T07`).
 *
 * Released only — an unverified number is not a result, and a doctor must not
 * be shown something nobody has signed. The card renders nothing at all when
 * there is nothing signed out yet: the request card above already says what is
 * being waited on, and an empty second card would say it twice.
 */
export function EncounterLabResultsCard({
  patientId,
  labResults,
}: EncounterLabResultsCardProps) {
  const t = useTranslations('clinical');

  if (labResults.length === 0) {
    return null;
  }

  const groups = groupLabResultsByOrder(labResults);

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">
          {t('encounters.laboratory.results.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group) => (
          <LabResultsGroup key={group.labOrderId} group={group} patientId={patientId} />
        ))}
      </CardContent>
    </Card>
  );
}
