'use client';

import type { VitalSignsResponse } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { EncounterVitalsForm } from '#components/client/encounters/encounter-vitals-form';
import { EncounterVitalsRow } from '#components/client/encounters/encounter-vitals-row';

type EncounterVitalsCardProps = {
  encounterId: string;
  vitalSigns: VitalSignsResponse[];
  isEditable: boolean;
};

export function EncounterVitalsCard({
  encounterId,
  vitalSigns,
  isEditable,
}: EncounterVitalsCardProps) {
  const t = useTranslations('clinical');
  const format = useFormatter();
  // Newest first: a recheck is what the clinician is looking for, and the
  // reading that prompted it stays underneath rather than being overwritten.
  const orderedVitalSigns = [...vitalSigns].sort(
    (left, right) => new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime(),
  );

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">
          {t('encounters.vitals.title')}
          <span className="ml-2 text-xs font-normal text-slate-400">
            {t('encounters.vitals.recorded', { count: format.number(vitalSigns.length) })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditable ? <EncounterVitalsForm encounterId={encounterId} /> : null}
        {orderedVitalSigns.length > 0 ? (
          <ul className="space-y-2">
            {orderedVitalSigns.map((measurement) => (
              <EncounterVitalsRow key={measurement.id} vitalSigns={measurement} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('encounters.vitals.empty')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
