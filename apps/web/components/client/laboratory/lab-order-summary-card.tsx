'use client';

import type { LabOrderView, LabWorklistPatient } from '@hms/shared-types';
import { Badge, Card, CardContent } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { EncounterLabOrderTimeline } from '#components/client/encounters/encounter-lab-order-timeline';
import { LabPriorityBadge } from '#components/client/laboratory/lab-priority-badge';

type LabOrderSummaryCardProps = {
  order: LabOrderView;
  patient: LabWorklistPatient;
};

/**
 * Who and what, at the top of the order (`P18-T08`). The patient block is the
 * worklist's identity shape — no NIK, no address, no diagnosis — and the
 * timeline is the doctor's own four dots, reused so both sides of the lab
 * read the same wait.
 */
export function LabOrderSummaryCard({ order, patient }: LabOrderSummaryCardProps) {
  const t = useTranslations('operations.laboratory.order');
  const tCatalog = useTranslations('operations.laboratory');
  const format = useFormatter();

  return (
    <Card>
      <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">{t('patient')}</dt>
          <dd className="font-medium text-slate-900">{patient.fullName}</dd>
          <dt className="text-slate-500">{t('mrn')}</dt>
          <dd className="font-mono">{patient.mrn}</dd>
          <dt className="text-slate-500">{t('dob')}</dt>
          <dd>
            {format.dateTime(new Date(patient.dateOfBirth), { dateStyle: 'medium' })} ·{' '}
            {tCatalog(`sexes.${patient.sex}`)} · {patient.ageYears}
          </dd>
          <dt className="text-slate-500">{t('orderedBy')}</dt>
          <dd>{order.orderedByName}</dd>
          <dt className="text-slate-500">{t('orderedAt')}</dt>
          <dd>
            {format.dateTime(new Date(order.orderedAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </dd>
        </dl>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <LabPriorityBadge priority={order.priority} />
            <Badge variant="outline">{t(`statuses.${order.status}`)}</Badge>
            {order.isFasting ? <Badge variant="secondary">{t('fasting')}</Badge> : null}
            {order.fulfilmentSite === 'EXTERNAL' ? (
              <Badge variant="secondary">
                {t('external', { facility: order.externalFacilityName ?? '' })}
              </Badge>
            ) : null}
          </div>
          <EncounterLabOrderTimeline status={order.status} />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{t('notes')}</p>
            <p className="text-sm text-slate-800">{order.clinicalNotes ?? t('noNotes')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
