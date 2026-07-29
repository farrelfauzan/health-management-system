import type { InvoiceDetail } from '@hms/shared-types';

import {
  getInvoiceControllerGetInvoiceByIdV1QueryKey,
  invoiceControllerGetInvoiceByIdV1,
} from '#lib/api/generated/invoices/invoices';
import { useApiQuery } from '#lib/api/use-api-query';

export function useInvoiceDetail(invoiceId: string | null) {
  const query = useApiQuery<InvoiceDetail>({
    queryKey: getInvoiceControllerGetInvoiceByIdV1QueryKey(invoiceId ?? ''),
    queryFn: (signal) => invoiceControllerGetInvoiceByIdV1(invoiceId ?? '', signal),
    errorMessage: 'Failed to load the invoice',
    enabled: Boolean(invoiceId),
  });

  return {
    ...query,
    invoice: query.data,
  };
}
