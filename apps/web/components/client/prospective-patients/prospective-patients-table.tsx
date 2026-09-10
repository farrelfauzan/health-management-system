'use client';

import type { ProspectivePatientView } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ProspectivePatientsTableRow } from '#components/client/prospective-patients/prospective-patients-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 8;

type ProspectivePatientsTableProps = {
  items: ProspectivePatientView[];
  isPending: boolean;
  isError: boolean;
  onResult: (message: string) => void;
  onFailed: (message: string) => void;
};

export function ProspectivePatientsTable({
  items,
  isPending,
  isError,
  onResult,
  onFailed,
}: ProspectivePatientsTableProps) {
  const t = useTranslations('prospectivePatients');
  const showEmptyState = !isPending && items.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'chat_bubble'}
        title={isError ? t('states.error') : t('states.emptyTitle')}
        description={isError ? undefined : t('states.emptyDescription')}
        className="rounded-none border-0"
      />
    );
  }

  return (
    <DataTable className="rounded-none border-0" minWidthClassName="min-w-[72rem]">
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('columns.name')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.phone')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.channel')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.appointment')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.status')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.expires')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.received')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('columns.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          items.map((item) => (
            <ProspectivePatientsTableRow
              key={item.id}
              item={item}
              onResult={onResult}
              onFailed={onFailed}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
