'use client';

import type { TaxAssignmentRowView } from '@hms/shared-types';
import { Badge, Checkbox, TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TaxTreatmentBadge } from '#components/client/taxes/tax-treatment-badge';
import { formatRupiah } from '#lib/billing/format-rupiah';
import { toTaxAssignmentKey } from '#lib/taxes/to-tax-assignment-key';

type TaxAssignmentsTableRowProps = {
  row: TaxAssignmentRowView;
  canWrite: boolean;
  isSelected: boolean;
  onToggle: (key: string) => void;
};

/**
 * One tariff or medication and the code it is taxed under. An unresolved row
 * is marked, because invoice issue will refuse it once P27-T04 lands.
 */
export function TaxAssignmentsTableRow({
  row,
  canWrite,
  isSelected,
  onToggle,
}: TaxAssignmentsTableRowProps) {
  const t = useTranslations('operations.taxes.assignments');
  const key = toTaxAssignmentKey(row);

  return (
    <TableRow data-state={isSelected ? 'selected' : undefined}>
      {canWrite ? (
        <TableCell>
          <Checkbox
            aria-label={t('select', { name: row.name })}
            checked={isSelected}
            onCheckedChange={() => onToggle(key)}
          />
        </TableCell>
      ) : null}
      <TableCell>
        <p className="text-sm font-medium text-slate-900">{row.name}</p>
        <p className="font-mono text-xs text-slate-500">{row.code}</p>
      </TableCell>
      <TableCell className="text-xs text-slate-600">
        {t(`kind.${row.kind}`)}
        {row.category ? <p className="text-slate-400">{row.category}</p> : null}
      </TableCell>
      <TableCell className="text-right text-sm">
        {row.price === undefined ? '—' : formatRupiah(row.price)}
      </TableCell>
      <TableCell>
        {row.effectiveTaxCode ? (
          <div className="space-y-1">
            <p className="font-mono text-xs font-semibold">{row.effectiveTaxCode.code}</p>
            <TaxTreatmentBadge treatment={row.effectiveTaxCode.ppnTreatment} />
          </div>
        ) : (
          <span className="text-xs font-medium text-amber-700">{t('noCode')}</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={row.source === 'OVERRIDE' ? 'secondary' : 'outline'}>
          {t(`source.${row.source}`)}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
