'use client';

import type { InvoiceListItem } from '@hms/shared-types';
import { Button, TableCell, TableRow } from '@hms/ui';

import { AvatarInitials } from '#components/shared/avatar-initials';
import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';
import { formatRupiah } from '#lib/billing/format-rupiah';
import { formatRegisteredAt } from '#lib/registrations/format-registered-at';

type InvoicesTableRowProps = {
  invoice: InvoiceListItem;
  onOpen: (invoice: InvoiceListItem) => void;
};

export function InvoicesTableRow({ invoice, onOpen }: InvoicesTableRowProps) {
  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <DataTableMonoCell>{invoice.invoiceNumber}</DataTableMonoCell>
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-3">
          <AvatarInitials name={invoice.patient.fullName} />
          <div>
            <p className="text-sm font-medium text-slate-900">{invoice.patient.fullName}</p>
            <p className="font-mono text-xs text-slate-500">{invoice.patient.mrn}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {formatRegisteredAt(invoice.createdAt)}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{invoice.itemCount}</TableCell>
      <TableCell className="px-4 text-sm font-medium text-slate-900">
        {formatRupiah(invoice.totalAmount)}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={invoice.status} />
      </TableCell>
      <TableCell className="px-4 text-right">
        <Button type="button" size="sm" variant="outline" onClick={() => onOpen(invoice)}>
          Open
        </Button>
      </TableCell>
    </TableRow>
  );
}
