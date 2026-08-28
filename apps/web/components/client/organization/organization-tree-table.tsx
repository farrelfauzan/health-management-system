'use client';

import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { OrganizationTreeRow } from '#components/client/organization/organization-tree-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';
import { flattenOrganizationTree } from '#lib/organization/flatten-organization-tree';

const TABLE_COLUMN_COUNT = 5;

type OrganizationTreeTableProps = {
  roots: OrganizationUnitTreeNode[];
  isPending: boolean;
  isError: boolean;
  canManage: boolean;
  onAddChild: (parent: OrganizationUnitTreeNode) => void;
  onEdit: (unit: OrganizationUnitTreeNode) => void;
  onMove: (unit: OrganizationUnitTreeNode) => void;
  onArchive: (unit: OrganizationUnitTreeNode) => void;
  onDelete: (unit: OrganizationUnitTreeNode) => void;
};

export function OrganizationTreeTable({
  roots,
  isPending,
  isError,
  canManage,
  onAddChild,
  onEdit,
  onMove,
  onArchive,
  onDelete,
}: OrganizationTreeTableProps) {
  const t = useTranslations('operations.organization');
  const common = useTranslations('operations.common');
  const rows = flattenOrganizationTree(roots);

  if (!isPending && rows.length === 0) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'account_tree'}
        title={isError ? t('loadError') : t('empty')}
        description={
          isError
            ? t('loadErrorDescription')
            : canManage
              ? t('emptyDescription')
              : t('emptyReadOnly')
        }
      />
    );
  }

  return (
    <DataTable minWidthClassName="min-w-[48rem]">
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('name')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('kind')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('level')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('members')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{common('actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          rows.map((row) => (
            <OrganizationTreeRow
              key={row.unit.id}
              row={row}
              canManage={canManage}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onMove={onMove}
              onArchive={onArchive}
              onDelete={onDelete}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
