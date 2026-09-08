'use client';

import { useState } from 'react';
import type { LabOrderSummary } from '@hms/shared-types';
import { Badge, Button, Can, Icon } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { EncounterLabCancelDialog } from '#components/client/encounters/encounter-lab-cancel-dialog';
import { EncounterLabOrderTimeline } from '#components/client/encounters/encounter-lab-order-timeline';
import { canCancelLabOrder } from '#lib/laboratory/lab-order-status-steps';

type EncounterLabOrderRowProps = {
  order: LabOrderSummary;
  isEditable: boolean;
};

/**
 * One request, as the doctor's side of the bench (`P18-T07`).
 *
 * Leads with the order number because that is what the patient is told to
 * quote and what the analis writes on the worksheet — it is the handle the
 * conversation about this request will use.
 */
export function EncounterLabOrderRow({ order, isEditable }: EncounterLabOrderRowProps) {
  const t = useTranslations('clinical');
  const format = useFormatter();
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const isCancellable = isEditable && canCancelLabOrder(order.status);

  return (
    <li className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="font-heading text-sm font-medium text-slate-800">{order.orderNumber}</p>
          <p className="text-xs text-slate-500">
            {t('encounters.laboratory.order.summary', {
              count: order.itemCount,
              orderedAt: format.dateTime(new Date(order.orderedAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {order.priority === 'URGENT' ? (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
              {t('encounters.laboratory.order.urgent')}
            </Badge>
          ) : null}
          {isCancellable ? (
            <Can action="write" subject="LabOrder">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCancelling(true)}>
                <Icon name="close" size={16} />
                {t('encounters.laboratory.order.cancel')}
              </Button>
            </Can>
          ) : null}
        </div>
      </div>
      <EncounterLabOrderTimeline status={order.status} />
      {order.status === 'CANCELLED' ? (
        <p className="text-xs text-slate-500">{t('encounters.laboratory.order.cancelled')}</p>
      ) : order.status !== 'RELEASED' ? (
        <p className="text-xs text-slate-500">{t('encounters.laboratory.order.waiting')}</p>
      ) : null}
      {isCancelling ? (
        <EncounterLabCancelDialog
          open={isCancelling}
          onOpenChange={setIsCancelling}
          labOrderId={order.id}
          orderNumber={order.orderNumber}
        />
      ) : null}
    </li>
  );
}
