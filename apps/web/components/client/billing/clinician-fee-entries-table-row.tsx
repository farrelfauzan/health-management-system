'use client';

import type { ClinicianFeeEntryView } from '@hms/shared-types';
import { TableCell, TableRow, cn } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { formatRupiah } from '#lib/billing/format-rupiah';
import { formatClinicianFeeRuleValue } from '#lib/clinician-fees/format-clinician-fee-rule-value';

type ClinicianFeeEntriesTableRowProps = {
  entry: ClinicianFeeEntryView;
};

export function ClinicianFeeEntriesTableRow({ entry }: ClinicianFeeEntriesTableRowProps) {
  const t = useTranslations('operations.billing.fees');
  const format = useFormatter();
  const isReversal = entry.kind === 'REVERSAL';
  const amountClassName = cn('px-4 text-right text-sm', isReversal && 'text-danger');

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3 text-sm text-slate-600">
        {format.dateTime(new Date(entry.occurredAt), { dateStyle: 'medium', timeStyle: 'short' })}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-700">
        {t(`statements.kinds.${entry.kind}`)}
      </TableCell>
      <TableCell className="px-4 font-mono text-sm text-slate-700">{entry.invoiceNumber}</TableCell>
      <TableCell className="px-4 text-sm text-slate-800">
        {entry.description}
        {entry.quantity > 1 ? ` × ${entry.quantity}` : ''}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {formatClinicianFeeRuleValue({
          mode: entry.ruleMode,
          value: entry.ruleValue,
          perUnitLabel: t('perUnit'),
        })}
      </TableCell>
      <TableCell className={amountClassName}>{formatRupiah(entry.lineAmount)}</TableCell>
      <TableCell className={cn(amountClassName, 'font-medium')}>
        {formatRupiah(entry.grossFee)}
      </TableCell>
      <TableCell className={amountClassName}>{formatRupiah(entry.clinicShare)}</TableCell>
    </TableRow>
  );
}
