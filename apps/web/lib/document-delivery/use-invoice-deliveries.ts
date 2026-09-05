import type { ApiSuccess, InvoiceDeliveryTimelineView } from '@hms/shared-types';

import {
  getInvoiceDeliveryControllerListDeliveriesV1QueryKey,
  invoiceDeliveryControllerListDeliveriesV1,
} from '#lib/api/generated/invoice-delivery/invoice-delivery';
import { useApiQuery } from '#lib/api/use-api-query';

const QUEUED_POLL_INTERVAL_MS = 5_000;

/**
 * The delivery timeline of one invoice (P16-T27, FR-E4-14).
 *
 * The hook owns the polling decision, like the invoice-document hook: while
 * any row is QUEUED and due now — not one parked for a later `sendAt` — it
 * refetches on a short interval so the cashier watches QUEUED become SENT
 * within the 30 s US-E4-01 asks for, and goes quiet the moment nothing is
 * in flight.
 */
export function useInvoiceDeliveries(invoiceId: string, isEnabled: boolean = true) {
  const query = useApiQuery<InvoiceDeliveryTimelineView>({
    queryKey: getInvoiceDeliveryControllerListDeliveriesV1QueryKey(invoiceId),
    queryFn: (signal) => invoiceDeliveryControllerListDeliveriesV1(invoiceId, signal),
    errorMessage: 'Failed to load the delivery timeline',
    enabled: isEnabled && invoiceId.length > 0,
    options: {
      refetchInterval: (activeQuery) => {
        const envelope = activeQuery.state.data as
          ApiSuccess<InvoiceDeliveryTimelineView> | undefined;
        const isInFlight = envelope?.data.deliveries.some(
          (delivery) =>
            delivery.status === 'QUEUED' &&
            (delivery.sendAt === null || new Date(delivery.sendAt).getTime() <= Date.now()),
        );
        return isInFlight ? QUEUED_POLL_INTERVAL_MS : false;
      },
    },
  });

  return {
    ...query,
    timeline: query.data,
  };
}
