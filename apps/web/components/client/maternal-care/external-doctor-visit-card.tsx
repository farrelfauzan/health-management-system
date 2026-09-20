'use client';

import type { ExternalDoctorVisitResponse } from '@hms/shared-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

type ExternalDoctorVisitCardProps = {
  visits: ExternalDoctorVisitResponse[];
  onRecord: () => void;
};

/**
 * Doctor visits the mother made elsewhere (FR-ANC-07). They are listed here
 * rather than mixed into the antenatal visits because they are not this
 * clinic's encounters — they are what her Buku KIA says, and they count
 * towards the two visits Permenkes 21/2021 requires.
 */
export function ExternalDoctorVisitCard({ visits, onRecord }: ExternalDoctorVisitCardProps) {
  const t = useTranslations();

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="font-heading text-base">
          {t('maternalCare.externalDoctorVisits.title')}
        </CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={onRecord}>
          <Icon name="add" size={16} />
          {t('maternalCare.actions.recordExternalDoctorVisit')}
        </Button>
      </CardHeader>
      <CardContent>
        {visits.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {visits.map((visit) => (
              <li key={visit.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-slate-900">{visit.facilityName}</span>
                <span className="text-sm text-slate-600">{visit.visitedAt}</span>
                {visit.isUltrasoundDone ? (
                  <span className="rounded-full bg-success-tint px-2 py-0.5 text-xs text-success">
                    {t('maternalCare.externalDoctorVisits.isUltrasoundDone')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('maternalCare.externalDoctorVisits.empty')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
