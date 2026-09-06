'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { usePatientImmunizations } from '#lib/patients/use-patient-immunizations';

type PatientImmunizationsCardProps = {
  patientId: string;
};

/**
 * Every vaccination this person has had, most recent first — which is the
 * order the question is asked in: the last dose is what decides whether the
 * next is due (P10-T16). Read-only here; recording happens on the encounter,
 * where there is a visit to attach it to.
 */
export function PatientImmunizationsCard({ patientId }: PatientImmunizationsCardProps) {
  const t = useTranslations('clinical');
  const format = useFormatter();
  const immunizationsQuery = usePatientImmunizations(patientId);

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">
          {t('encounters.immunization.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {immunizationsQuery.immunizations.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {immunizationsQuery.isPending
              ? t('patients.loadingImmunizations')
              : t('patients.noImmunizations')}
          </p>
        ) : (
          <ul className="space-y-2">
            {immunizationsQuery.immunizations.map((immunization) => (
              <li
                key={immunization.id}
                className="rounded-lg border border-slate-200 px-3 py-2"
              >
                <p className="text-sm font-medium text-slate-900">
                  {immunization.medicationName}
                </p>
                <p className="text-xs text-slate-500">
                  {format.dateTime(new Date(immunization.occurredAt), { dateStyle: 'medium' })}
                  {immunization.doseNumber
                    ? ` · ${t('encounters.immunization.dose', { number: immunization.doseNumber })}`
                    : null}
                  {immunization.lotNumber ? ` · Lot ${immunization.lotNumber}` : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
