import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InvoiceDeliveryTimelineView, RequestInvoiceDeliveryInput } from '@hms/shared-types';

import { invoiceDeliveryControllerRequestDeliveryV1 } from '#lib/api/generated/invoice-delivery/invoice-delivery';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateBillingQueries } from '#lib/billing/invalidate-billing-queries';

/**
 * Queue a send (P16-T27, FR-E4-01). The server decides the destination — the
 * verified link or the email on record — the client sends channels, the
 * shape, and optionally when.
 */
export function useRequestInvoiceDelivery(invoiceId: string, errorMessage: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RequestInvoiceDeliveryInput) => {
      const response = await invoiceDeliveryControllerRequestDeliveryV1(invoiceId, input);
      return parseApiSuccess<InvoiceDeliveryTimelineView>(response, errorMessage);
    },
    onSuccess: async () => {
      await invalidateBillingQueries(queryClient);
    },
  });
}
