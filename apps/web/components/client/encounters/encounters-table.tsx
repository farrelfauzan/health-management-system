'use client';

import type { EncounterListItem } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { EncountersTableRow } from '#components/client/encounters/encounters-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 8;

type EncountersTableProps = {
  encounters: EncounterListItem[];
  isPending: boolean;
  isError: boolean;
  basePath: string;
};

export function EncountersTable({
  encounters,
  isPending,
  isError,
  basePath,
}: EncountersTableProps) {
  const t = useTranslations('clinical');
  const showEmptyState = !isPending && encounters.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'clinical_notes'}
        title={isError ? t('encounters.errorTitle') : t('encounters.emptyTitle')}
        description={isError ? t('encounters.errorDescription') : t('encounters.emptyDescription')}
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('encounters.columns.patient')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('encounters.columns.mrn')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('encounters.columns.started')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('encounters.columns.duration')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('encounters.columns.doctor')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('encounters.columns.records')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.status')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          encounters.map((encounter) => (
            <EncountersTableRow key={encounter.id} encounter={encounter} basePath={basePath} />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
