import type { ApiSuccess, InvoiceDocumentView, InvoiceStatusValue } from '@hms/shared-types';

import {
  getInvoiceDocumentControllerGetDocumentV1QueryKey,
  invoiceDocumentControllerGetDocumentV1,
} from '#lib/api/generated/invoices/invoices';
import { useApiQuery } from '#lib/api/use-api-query';

const RENDER_POLL_INTERVAL_MS = 2_500;

/**
 * The rendered-document state of one invoice (P16-T10).
 *
 * The hook owns the polling decision, matching the ingest-status hooks: while
 * the server reports PENDING — a snapshot cut at issue that nothing has
 * rendered yet, or a render another cashier kicked off — it refetches on a
 * short interval and goes quiet the moment the document settles. A 404 means
 * no document exists yet and surfaces as an ordinary query error the actions
 * component treats as "not rendered", not as something to retry.
 */
export function useInvoiceDocument(invoiceId: string, invoiceStatus: InvoiceStatusValue) {
  const query = useApiQuery<InvoiceDocumentView>({
    queryKey: getInvoiceDocumentControllerGetDocumentV1QueryKey(invoiceId),
    queryFn: (signal) => invoiceDocumentControllerGetDocumentV1(invoiceId, signal),
    errorMessage: 'Failed to load the invoice document',
    // A DRAFT invoice cannot have a document; asking would only 404.
    enabled: invoiceStatus !== 'DRAFT',
    options: {
      retry: false,
      refetchInterval: (activeQuery) => {
        const envelope = activeQuery.state.data as ApiSuccess<InvoiceDocumentView> | undefined;
        return envelope?.data.status === 'PENDING' ? RENDER_POLL_INTERVAL_MS : false;
      },
    },
  });

  return {
    ...query,
    invoiceDocument: query.data,
  };
}
