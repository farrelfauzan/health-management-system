'use client';

import type { DoctorEducation } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorEducationRow } from '#components/client/doctors/doctor-education-row';

type DoctorEducationsCardProps = {
  educations: DoctorEducation[];
};

export function DoctorEducationsCard({ educations }: DoctorEducationsCardProps) {
  const t = useTranslations('clinical');
  // Most recent first; entries without a year sink to the bottom rather than
  // being treated as year zero.
  const orderedEducations = [...educations].sort(
    (left, right) => (right.graduationYear ?? 0) - (left.graduationYear ?? 0),
  );

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">{t('doctors.educationTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {orderedEducations.length > 0 ? (
          <ul className="space-y-2">
            {orderedEducations.map((education) => (
              <DoctorEducationRow key={education.id} education={education} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('doctors.educationEmpty')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
