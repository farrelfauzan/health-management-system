'use client';

import { useState } from 'react';
import type { PatientProfile } from '@hms/shared-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Icon, useAbility } from '@hms/ui';

import { usePatientIdentifiers } from '#lib/patients/use-patient-identifiers';

type PatientIdentifiersCardProps = {
  patient: PatientProfile;
};

export function PatientIdentifiersCard({ patient }: PatientIdentifiersCardProps) {
  const ability = useAbility();
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const identifiersQuery = usePatientIdentifiers(patient.id, isRevealed);
  const canReveal = ability.can('read-identifier', 'Patient');
  const identifiers = identifiersQuery.identifiers;

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="font-heading text-base">National Identifiers</CardTitle>
        {canReveal && !isRevealed ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setIsRevealed(true)}>
            <Icon name="visibility" size={16} />
            Reveal
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="font-heading text-xs font-medium text-slate-600">NIK</dt>
            <dd className="font-mono text-sm text-slate-800">
              {identifiers?.nik ?? patient.nikMasked ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="font-heading text-xs font-medium text-slate-600">BPJS Number</dt>
            <dd className="font-mono text-sm text-slate-800">
              {identifiers?.bpjsNumber ?? patient.bpjsNumberMasked ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="font-heading text-xs font-medium text-slate-600">SATUSEHAT (IHS)</dt>
            <dd className="font-mono text-sm text-slate-800">
              {identifiers?.satusehatPatientId ??
                (patient.hasSatusehatPatientId ? 'Linked' : 'Not linked')}
            </dd>
          </div>
        </dl>

        {identifiersQuery.isPending && isRevealed ? (
          <p className="text-sm text-slate-500">Revealing...</p>
        ) : null}

        {identifiersQuery.error ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {identifiersQuery.error.message}
          </p>
        ) : null}

        {isRevealed && identifiers ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-900">
              This reveal was recorded in the audit log with your account.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setIsRevealed(false)}>
              Hide
            </Button>
          </div>
        ) : null}

        {!canReveal ? (
          <p className="text-xs text-slate-500">
            Full values require the patient identifier permission.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
