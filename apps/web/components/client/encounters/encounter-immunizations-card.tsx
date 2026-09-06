'use client';

import type { ImmunizationResponse } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { EncounterImmunizationForm } from '#components/client/encounters/encounter-immunization-form';
import { EncounterImmunizationRow } from '#components/client/encounters/encounter-immunization-row';

type EncounterImmunizationsCardProps = {
  encounterId: string;
  immunizations: ImmunizationResponse[];
  isEditable: boolean;
};

export function EncounterImmunizationsCard({
  encounterId,
  immunizations,
  isEditable,
}: EncounterImmunizationsCardProps) {
  const t = useTranslations('clinical');
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">
          {t('encounters.immunization.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditable ? <EncounterImmunizationForm encounterId={encounterId} /> : null}
        {immunizations.length > 0 ? (
          <ul className="space-y-2">
            {immunizations.map((immunization) => (
              <EncounterImmunizationRow
                key={immunization.id}
                encounterId={encounterId}
                immunization={immunization}
                isEditable={isEditable}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('encounters.immunization.empty')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
