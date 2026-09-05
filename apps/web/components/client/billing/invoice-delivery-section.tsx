'use client';

import { useState } from 'react';
import type { InvoiceDetail } from '@hms/shared-types';
import { Button, Icon, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InvoiceDeliveryTimeline } from '#components/client/billing/invoice-delivery-timeline';
import { SendInvoiceDialog } from '#components/client/billing/send-invoice-dialog';

type InvoiceDeliverySectionProps = {
  invoice: InvoiceDetail;
};

const DELIVERABLE_STATUSES: readonly InvoiceDetail['status'][] = ['ISSUED', 'PAID'];

/**
 * The delivery block of the invoice dialog (P16-T27): the Send button and the
 * timeline below it. Visibility follows `invoice.deliver` — a key separate
 * from `invoice.write` on purpose (§7.4.10) — and the API's guard remains the
 * one that refuses. Hidden on a draft: nothing is rendered to send yet.
 */
export function InvoiceDeliverySection({ invoice }: InvoiceDeliverySectionProps) {
  const t = useTranslations('operations.billing.delivery');
  const ability = useAbility();
  const canDeliver = ability.can('deliver', 'Invoice');
  const [isSendOpen, setIsSendOpen] = useState<boolean>(false);
  const isDeliverable = DELIVERABLE_STATUSES.includes(invoice.status);

  if (invoice.status === 'DRAFT') {
    return null;
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{t('timelineTitle')}</p>
        {canDeliver && isDeliverable ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setIsSendOpen(true)}>
            <Icon name="send" size={18} />
            {t('send')}
          </Button>
        ) : null}
      </div>
      <InvoiceDeliveryTimeline invoiceId={invoice.id} canAct={canDeliver} />
      {canDeliver && isDeliverable ? (
        <SendInvoiceDialog invoice={invoice} open={isSendOpen} onOpenChange={setIsSendOpen} />
      ) : null}
    </div>
  );
}
