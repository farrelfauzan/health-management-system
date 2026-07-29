import type { InvoiceListItem, InvoicesListMeta } from '@hms/shared-types';

import {
  getInvoiceControllerListInvoicesV1QueryKey,
  invoiceControllerListInvoicesV1,
} from '#lib/api/generated/invoices/invoices';
import type { InvoiceControllerListInvoicesV1Params } from '#lib/api/generated/model/invoiceControllerListInvoicesV1Params';
import { useApiQuery } from '#lib/api/use-api-query';
import type { InvoicesSearchParams } from '#lib/billing/search-params';

export function useInvoicesList(params: InvoicesSearchParams) {
  const requestParams: InvoiceControllerListInvoicesV1Params = {
    page: params.page,
    limit: params.limit,
    status: params.status,
    patientId: params.patientId,
    encounterId: params.encounterId,
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
  };

  const query = useApiQuery<InvoiceListItem[]>({
    queryKey: getInvoiceControllerListInvoicesV1QueryKey(requestParams),
    queryFn: (signal) => invoiceControllerListInvoicesV1(requestParams, signal),
    errorMessage: 'Failed to load invoices',
  });

  return {
    ...query,
    invoices: query.data ?? [],
    meta: query.meta as InvoicesListMeta | undefined,
  };
}
