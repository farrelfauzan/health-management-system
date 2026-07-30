'use client';

import type { InvoiceListItem } from '@hms/shared-types';
import { Button, TableCell, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { AvatarInitials } from '#components/shared/avatar-initials';
import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';

type InvoicesTableRowProps = {
  invoice: InvoiceListItem;
  onOpen: (invoice: InvoiceListItem) => void;
};

export function InvoicesTableRow({ invoice, onOpen }: InvoicesTableRowProps) {
  const t = useTranslations('operations');
  const format = useFormatter();
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
        {format.dateTime(new Date(invoice.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {t('billing.items', { count: invoice.itemCount })}
      </TableCell>
      <TableCell className="px-4 text-sm font-medium text-slate-900">
        {format.number(invoice.totalAmount, {
          style: 'currency',
          currency: 'IDR',
          maximumFractionDigits: 2,
        })}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={invoice.status} label={t(`common.statuses.${invoice.status}`)} />
      </TableCell>
      <TableCell className="px-4 text-right">
        <Button type="button" size="sm" variant="outline" onClick={() => onOpen(invoice)}>
          {t('billing.open')}
        </Button>
      </TableCell>
    </TableRow>
  );
}
