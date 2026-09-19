'use client';

import type { TaxAssignmentRowView } from '@hms/shared-types';
import { Checkbox, Skeleton, Table, TableBody, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TaxAssignmentsTableRow } from '#components/client/taxes/tax-assignments-table-row';
import { toTaxAssignmentKey } from '#lib/taxes/to-tax-assignment-key';

type TaxAssignmentsTableProps = {
  rows: TaxAssignmentRowView[];
  isPending: boolean;
  isError: boolean;
  canWrite: boolean;
  selectedKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onTogglePage: (isSelected: boolean) => void;
};

export function TaxAssignmentsTable({
  rows,
  isPending,
  isError,
  canWrite,
  selectedKeys,
  onToggle,
  onTogglePage,
}: TaxAssignmentsTableProps) {
  const t = useTranslations('operations.taxes.assignments');

  if (isPending) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (isError) {
    return (
      <p role="alert" className="text-sm text-rose-700">
        {t('loadError')}
      </p>
    );
  }
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{t('empty')}</p>;
  }
  const isPageSelected = rows.every((row) => selectedKeys.has(toTaxAssignmentKey(row)));

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {canWrite ? (
              <TableHead className="w-10">
                <Checkbox
                  aria-label={t('selectPage')}
                  checked={isPageSelected}
                  onCheckedChange={(checked) => onTogglePage(checked === true)}
                />
              </TableHead>
            ) : null}
            <TableHead>{t('columns.item')}</TableHead>
            <TableHead>{t('columns.kind')}</TableHead>
            <TableHead className="text-right">{t('columns.price')}</TableHead>
            <TableHead>{t('columns.taxCode')}</TableHead>
            <TableHead>{t('columns.source')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TaxAssignmentsTableRow
              key={toTaxAssignmentKey(row)}
              row={row}
              canWrite={canWrite}
              isSelected={selectedKeys.has(toTaxAssignmentKey(row))}
              onToggle={onToggle}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
