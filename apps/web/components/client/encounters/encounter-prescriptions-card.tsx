'use client';

import type { EncounterRelatedPrescription } from '@hms/shared-types';
import { Can, Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { EncounterPrescriptionForm } from '#components/client/encounters/encounter-prescription-form';
import { StatusBadge } from '#components/shared/status-badge';

type EncounterPrescriptionsCardProps = {
  encounterId: string;
  patientId: string;
  prescriptions: EncounterRelatedPrescription[];
  isEditable: boolean;
};

export function EncounterPrescriptionsCard({
  encounterId,
  patientId,
  prescriptions,
  isEditable,
}: EncounterPrescriptionsCardProps) {
  const t = useTranslations('clinical');
  const format = useFormatter();
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">{t('encounters.prescriptions')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditable ? (
          <Can action="write" subject="Prescription">
            <EncounterPrescriptionForm encounterId={encounterId} patientId={patientId} />
          </Can>
        ) : null}
        {prescriptions.length > 0 ? (
          <ul className="space-y-2">
            {prescriptions.map((prescription) => (
              <li
                key={prescription.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
              >
                <div>
                  <p className="text-sm text-slate-700">
                    {t('encounters.prescriptionItems', { count: prescription.itemCount })}
                  </p>
                  {prescription.issuedAt ? (
                    <p className="text-xs text-slate-500">
                      {t('encounters.issuedAt', {
                        date: format.dateTime(new Date(prescription.issuedAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }),
                      })}
                    </p>
                  ) : null}
                </div>
                <StatusBadge
                  status={prescription.status}
                  label={t(`encounters.prescriptionStatus.${prescription.status}`)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('encounters.prescriptionsEmpty')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
