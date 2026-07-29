'use client';

import { useState } from 'react';
import type { InvoiceListItem } from '@hms/shared-types';
import { Card, CardContent } from '@hms/ui';

import { InvoiceDetailDialog } from '#components/client/billing/invoice-detail-dialog';
import {
  InvoicesFilterCard,
  type InvoicesFilterValues,
} from '#components/client/billing/invoices-filter-card';
import { InvoicesTable } from '#components/client/billing/invoices-table';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { INVOICES_PAGE_SIZE, type InvoicesSearchParams } from '#lib/billing/search-params';
import { useInvoicesList } from '#lib/billing/use-invoices-list';

export function InvoicesPanel() {
  const [query, setQuery] = useState<InvoicesSearchParams>({
    page: 1,
    limit: INVOICES_PAGE_SIZE,
  });
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const invoicesQuery = useInvoicesList(query);

  function handleApplyFilters(filters: InvoicesFilterValues): void {
    setQuery({ page: 1, limit: query.limit, ...filters });
  }

  function handleOpenInvoice(invoice: InvoiceListItem): void {
    setOpenInvoiceId(invoice.id);
  }

  return (
    <div className="space-y-5">
      <InvoicesFilterCard
        initialQuery={query}
        onApply={handleApplyFilters}
        onReset={() => setQuery({ page: 1, limit: query.limit })}
      />

      {invoicesQuery.error && invoicesQuery.invoices.length > 0 ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {invoicesQuery.error.message}
        </p>
      ) : null}

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <InvoicesTable
            invoices={invoicesQuery.invoices}
            isPending={invoicesQuery.isPending}
            isError={invoicesQuery.isError}
            onOpen={handleOpenInvoice}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={query.page}
            pageSize={query.limit}
            total={invoicesQuery.meta?.total ?? 0}
            itemLabel="invoices"
            isDisabled={invoicesQuery.isFetching}
            onPageChange={(nextPage) => setQuery({ ...query, page: nextPage })}
          />
        </CardContent>
      </Card>

      {openInvoiceId ? (
        <InvoiceDetailDialog
          key={openInvoiceId}
          invoiceId={openInvoiceId}
          open={Boolean(openInvoiceId)}
          onOpenChange={(dialogOpen) => {
            if (!dialogOpen) {
              setOpenInvoiceId(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}
