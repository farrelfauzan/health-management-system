'use client';

import type { ProcedureResponse } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { EncounterProcedureForm } from '#components/client/encounters/encounter-procedure-form';
import { EncounterProcedureRow } from '#components/client/encounters/encounter-procedure-row';

type EncounterProceduresCardProps = {
  encounterId: string;
  procedures: ProcedureResponse[];
  isEditable: boolean;
};

export function EncounterProceduresCard({
  encounterId,
  procedures,
  isEditable,
}: EncounterProceduresCardProps) {
  const t = useTranslations('clinical');
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">{t('encounters.procedure.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditable ? <EncounterProcedureForm encounterId={encounterId} /> : null}
        {procedures.length > 0 ? (
          <ul className="space-y-2">
            {procedures.map((procedure) => (
              <EncounterProcedureRow
                key={procedure.id}
                encounterId={encounterId}
                procedure={procedure}
                isEditable={isEditable}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('encounters.procedure.empty')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
