'use client';

import type { PatientAllergy } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PatientAllergyRow } from '#components/client/patients/patient-allergy-row';
import { ALLERGY_SEVERITY_ORDER } from '#lib/patients/allergy-severity-meta';

type PatientAllergiesCardProps = {
  allergies: PatientAllergy[];
};

export function PatientAllergiesCard({ allergies }: PatientAllergiesCardProps) {
  const t = useTranslations('clinical');
  // Most severe first: this card exists so a clinician sees the dangerous one
  // without reading the list.
  const orderedAllergies = [...allergies].sort(
    (left, right) =>
      ALLERGY_SEVERITY_ORDER.indexOf(left.severity) -
      ALLERGY_SEVERITY_ORDER.indexOf(right.severity),
  );

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base">
          {t('patients.allergies')}
          {allergies.length > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-danger-tint px-2 py-0.5 text-xs font-medium text-danger">
              <Icon name="warning" size={14} />
              {allergies.length}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {orderedAllergies.length > 0 ? (
          <ul className="space-y-2">
            {orderedAllergies.map((allergy) => (
              <PatientAllergyRow key={allergy.id} allergy={allergy} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('patients.allergiesEmpty')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
