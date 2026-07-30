'use client';

import { useState } from 'react';
import type { PatientProfile } from '@hms/shared-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Icon, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { usePatientIdentifiers } from '#lib/patients/use-patient-identifiers';

type PatientIdentifiersCardProps = {
  patient: PatientProfile;
};

export function PatientIdentifiersCard({ patient }: PatientIdentifiersCardProps) {
  const ability = useAbility();
  const t = useTranslations('clinical');
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const identifiersQuery = usePatientIdentifiers(patient.id, isRevealed);
  const canReveal = ability.can('read-identifier', 'Patient');
  const identifiers = identifiersQuery.identifiers;

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="font-heading text-base">{t('patients.identifiers')}</CardTitle>
        {canReveal && !isRevealed ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setIsRevealed(true)}>
            <Icon name="visibility" size={16} />
            {t('patients.reveal')}
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
            <dt className="font-heading text-xs font-medium text-slate-600">
              {t('patients.bpjsNumber')}
            </dt>
            <dd className="font-mono text-sm text-slate-800">
              {identifiers?.bpjsNumber ?? patient.bpjsNumberMasked ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="font-heading text-xs font-medium text-slate-600">SATUSEHAT (IHS)</dt>
            <dd className="font-mono text-sm text-slate-800">
              {identifiers?.satusehatPatientId ??
                (patient.hasSatusehatPatientId ? t('patients.linked') : t('patients.notLinked'))}
            </dd>
          </div>
        </dl>

        {identifiersQuery.isPending && isRevealed ? (
          <p className="text-sm text-slate-500">{t('patients.revealing')}</p>
        ) : null}

        {identifiersQuery.error ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {t('patients.identifiersError')}
          </p>
        ) : null}

        {isRevealed && identifiers ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-900">{t('patients.auditNotice')}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setIsRevealed(false)}>
              {t('patients.hide')}
            </Button>
          </div>
        ) : null}

        {!canReveal ? (
          <p className="text-xs text-slate-500">{t('patients.identifierPermission')}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
