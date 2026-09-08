'use client';

import type { LabOrderSummary } from '@hms/shared-types';
import { Can, Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { EncounterLabOrderForm } from '#components/client/encounters/encounter-lab-order-form';
import { EncounterLabOrderRow } from '#components/client/encounters/encounter-lab-order-row';

type EncounterLabCardProps = {
  encounterId: string;
  labOrders: LabOrderSummary[];
  isEditable: boolean;
};

/**
 * Pemeriksaan Lab: asking for laboratory work, and watching for it, from the
 * screen the doctor is already on (`P18-T07`).
 *
 * The form sits above the list rather than behind a button because ordering is
 * the common act here — the list is what the doctor comes back to later, and it
 * is short.
 *
 * `Can` guards visibility only. The API's `PermissionsGuard` is what refuses a
 * request from anyone who reaches the route regardless, and the whole card is
 * absent for a clinic without the `laboratory` entitlement.
 */
export function EncounterLabCard({ encounterId, labOrders, isEditable }: EncounterLabCardProps) {
  const t = useTranslations('clinical');

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">
          {t('encounters.laboratory.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditable ? (
          <Can action="write" subject="LabOrder">
            <EncounterLabOrderForm encounterId={encounterId} />
          </Can>
        ) : null}
        {labOrders.length > 0 ? (
          <ul className="space-y-2">
            {labOrders.map((order) => (
              <EncounterLabOrderRow key={order.id} order={order} isEditable={isEditable} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('encounters.laboratory.empty')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
