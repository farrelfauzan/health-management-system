'use client';

import type { ClinicianFeeRuleView } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicianFeeRulesTableRow } from '#components/client/billing/clinician-fee-rules-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 5;

type ClinicianFeeRulesTableProps = {
  rules: ClinicianFeeRuleView[];
  isPending: boolean;
  isError: boolean;
  canWrite: boolean;
  onEdit: (rule: ClinicianFeeRuleView) => void;
  onDelete: (rule: ClinicianFeeRuleView) => void;
};

export function ClinicianFeeRulesTable({
  rules,
  isPending,
  isError,
  canWrite,
  onEdit,
  onDelete,
}: ClinicianFeeRulesTableProps) {
  const t = useTranslations('operations.billing.fees.rules');
  const tCommon = useTranslations('operations.common');

  if (!isPending && rules.length === 0) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'percent'}
        title={isError ? t('loadError') : t('empty')}
        description={isError ? undefined : t('emptyDescription')}
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('target')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('clinician')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('share')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('effective')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{tCommon('actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          rules.map((rule) => (
            <ClinicianFeeRulesTableRow
              key={rule.id}
              rule={rule}
              canWrite={canWrite}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
