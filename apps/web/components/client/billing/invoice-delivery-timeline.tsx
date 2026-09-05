'use client';

import { useState } from 'react';
import type { DeliveryActionKind } from '@hms/shared-types';
import { Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InvoiceDeliveryTimelineRow } from '#components/client/billing/invoice-delivery-timeline-row';
import { notifyApiError } from '#lib/api/notify-api-error';
import { useDeliveryAction } from '#lib/document-delivery/use-delivery-action';
import { useInvoiceDeliveries } from '#lib/document-delivery/use-invoice-deliveries';

type InvoiceDeliveryTimelineProps = {
  invoiceId: string;
  canAct: boolean;
};

/**
 * What was sent, on which channel, to which masked destination, by whom,
 * and where it stands (P16-T27, FR-E4-14) — with retry, revoke and cancel
 * on the rows that allow them. Polls while a send is in flight.
 */
export function InvoiceDeliveryTimeline({ invoiceId, canAct }: InvoiceDeliveryTimelineProps) {
  const t = useTranslations('operations.billing.delivery');
  const query = useInvoiceDeliveries(invoiceId);
  const actionMutation = useDeliveryAction(t('actionError'));
  const [pending, setPending] = useState<{ deliveryId: string; action: DeliveryActionKind } | null>(
    null,
  );

  async function handleAction(deliveryId: string, action: DeliveryActionKind): Promise<void> {
    setPending({ deliveryId, action });
    try {
      await actionMutation.mutateAsync({ deliveryId, action });
    } catch (error) {
      notifyApiError(error, t('actionError'));
    } finally {
      setPending(null);
    }
  }

  if (query.isPending) {
    return <Skeleton className="h-16 w-full" />;
  }
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-rose-700">
        {t('timelineError')}
      </p>
    );
  }
  const deliveries = query.timeline?.deliveries ?? [];
  if (deliveries.length === 0) {
    return <p className="text-xs text-slate-500">{t('timelineEmpty')}</p>;
  }
  return (
    <ul className="space-y-2">
      {deliveries.map((delivery) => (
        <InvoiceDeliveryTimelineRow
          key={delivery.id}
          delivery={delivery}
          canAct={canAct}
          pendingAction={pending?.deliveryId === delivery.id ? pending.action : null}
          onAction={(action) => void handleAction(delivery.id, action)}
        />
      ))}
    </ul>
  );
}
