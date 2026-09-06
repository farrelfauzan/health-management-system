'use client';

import { useState } from 'react';
import type { DoctorDetail } from '@hms/shared-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Icon, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorSatusehatLinkButton } from '#components/client/doctors/doctor-satusehat-link-button';
import { useDoctorIdentifiers } from '#lib/doctors/use-doctor-identifiers';

type DoctorIdentifiersCardProps = {
  doctor: DoctorDetail;
  isSatusehatEnabled: boolean;
};

export function DoctorIdentifiersCard({
  doctor,
  isSatusehatEnabled,
}: DoctorIdentifiersCardProps) {
  const ability = useAbility();
  const t = useTranslations('clinical');
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const identifiersQuery = useDoctorIdentifiers(doctor.id, isRevealed);
  const canReveal = ability.can('read-identifier', 'Doctor');

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="font-heading text-base">{t('doctors.identity')}</CardTitle>
        <div className="flex items-center gap-2">
          <DoctorSatusehatLinkButton
            doctorId={doctor.id}
            hasNik={Boolean(doctor.nikMasked)}
            isLinked={doctor.satusehatPractitionerId !== undefined}
            isSatusehatEnabled={isSatusehatEnabled}
          />
          {canReveal && !isRevealed ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setIsRevealed(true)}>
              <Icon name="visibility" size={16} />
              {t('doctors.reveal')}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="font-heading text-xs font-medium text-slate-600">NIK</dt>
            <dd className="font-mono text-sm text-slate-800">
              {identifiersQuery.identifiers?.nik ?? doctor.nikMasked ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="font-heading text-xs font-medium text-slate-600">SATUSEHAT (IHS)</dt>
            <dd className="font-mono text-sm text-slate-800">
              {doctor.satusehatPractitionerId ?? t('doctors.notLinked')}
            </dd>
          </div>
        </dl>

        {/* STR and SIP numbers are absent here on purpose: KKI and IDI publish
            them, so they are registry-public and ride unmasked on the licences
            card rather than behind an audited reveal. */}

        {identifiersQuery.isPending && isRevealed ? (
          <p className="text-sm text-slate-500">{t('doctors.revealing')}</p>
        ) : null}

        {identifiersQuery.error ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {t('doctors.identifiersError')}
          </p>
        ) : null}

        {isRevealed && identifiersQuery.identifiers ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-900">{t('doctors.identifierAudit')}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setIsRevealed(false)}>
              {t('doctors.hide')}
            </Button>
          </div>
        ) : null}

        {!canReveal ? (
          <p className="text-xs text-slate-500">{t('doctors.identifierPermission')}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
