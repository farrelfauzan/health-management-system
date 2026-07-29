'use client';

import type { DiagnosisResponse } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';

import { EncounterDiagnosisForm } from '#components/client/encounters/encounter-diagnosis-form';
import { EncounterDiagnosisRow } from '#components/client/encounters/encounter-diagnosis-row';

type EncounterDiagnosesCardProps = {
  encounterId: string;
  diagnoses: DiagnosisResponse[];
  isEditable: boolean;
};

export function EncounterDiagnosesCard({
  encounterId,
  diagnoses,
  isEditable,
}: EncounterDiagnosesCardProps) {
  const hasPrimaryDiagnosis = diagnoses.some((diagnosis) => diagnosis.type === 'PRIMARY');
  // PRIMARY first: it is the diagnosis that justifies the visit, and both the
  // BPJS kunjungan and the SATUSEHAT Condition single it out.
  const orderedDiagnoses = [...diagnoses].sort((left, right) =>
    left.type === right.type ? 0 : left.type === 'PRIMARY' ? -1 : 1,
  );

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">Diagnoses (ICD-10)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditable ? (
          <EncounterDiagnosisForm
            encounterId={encounterId}
            hasPrimaryDiagnosis={hasPrimaryDiagnosis}
          />
        ) : null}
        {!hasPrimaryDiagnosis ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No primary diagnosis yet. BPJS and SATUSEHAT submissions both need one — the visit
            cannot be claimed without it.
          </p>
        ) : null}
        {orderedDiagnoses.length > 0 ? (
          <ul className="space-y-2">
            {orderedDiagnoses.map((diagnosis) => (
              <EncounterDiagnosisRow
                key={diagnosis.id}
                encounterId={encounterId}
                diagnosis={diagnosis}
                isEditable={isEditable}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            No diagnosis coded for this visit.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
