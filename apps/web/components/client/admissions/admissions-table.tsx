'use client';

import type { AdmissionResponse } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AdmissionsTableRow } from '#components/client/admissions/admissions-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 7;

type AdmissionsTableProps = {
  admissions: AdmissionResponse[];
  isPending: boolean;
  isError: boolean;
  canTransfer: boolean;
  canDischarge: boolean;
  canCancel: boolean;
  onOpen: (admission: AdmissionResponse) => void;
  onTransfer: (admission: AdmissionResponse) => void;
  onDischarge: (admission: AdmissionResponse) => void;
  onCancel: (admission: AdmissionResponse) => void;
};

export function AdmissionsTable({
  admissions,
  isPending,
  isError,
  canTransfer,
  canDischarge,
  canCancel,
  onOpen,
  onTransfer,
  onDischarge,
  onCancel,
}: AdmissionsTableProps) {
  const t = useTranslations('operations');

  if (!isPending && admissions.length === 0) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'bed'}
        title={isError ? t('admissions.loadError') : t('admissions.empty')}
        description={
          isError ? t('admissions.loadErrorDescription') : t('admissions.emptyDescription')
        }
      />
    );
  }

  return (
    <DataTable minWidthClassName="min-w-[56rem]">
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>MRN</DataTableHeaderCell>
          <DataTableHeaderCell>{t('admissions.patient')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('admissions.doctor')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('admissions.bed')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('admissions.admittedAt')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('admissions.status')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          admissions.map((admission) => (
            <AdmissionsTableRow
              key={admission.id}
              admission={admission}
              canTransfer={canTransfer}
              canDischarge={canDischarge}
              canCancel={canCancel}
              onOpen={onOpen}
              onTransfer={onTransfer}
              onDischarge={onDischarge}
              onCancel={onCancel}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
