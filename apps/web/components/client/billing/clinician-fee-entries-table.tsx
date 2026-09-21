'use client';

import type { ClinicianFeeEntryView } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicianFeeEntriesTableRow } from '#components/client/billing/clinician-fee-entries-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';

type ClinicianFeeEntriesTableProps = {
  entries: ClinicianFeeEntryView[];
};

export function ClinicianFeeEntriesTable({ entries }: ClinicianFeeEntriesTableProps) {
  const t = useTranslations('operations.billing.fees.statements');

  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">{t('noEntries')}</p>;
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('time')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('kind')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('invoice')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('service')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rule')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('lineAmount')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('grossFee')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('clinicShare')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <ClinicianFeeEntriesTableRow key={entry.id} entry={entry} />
        ))}
      </TableBody>
    </DataTable>
  );
}
