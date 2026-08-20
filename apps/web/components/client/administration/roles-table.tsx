'use client';

import type { RoleListItem } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RolesTableRow } from '#components/client/administration/roles-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 5;

type RolesTableProps = {
  roles: RoleListItem[];
  isPending: boolean;
  isError: boolean;
  onEdit: (role: RoleListItem) => void;
  onEditPermissions: (role: RoleListItem) => void;
  onDelete: (role: RoleListItem) => void;
};

export function RolesTable({
  roles,
  isPending,
  isError,
  onEdit,
  onEditPermissions,
  onDelete,
}: RolesTableProps) {
  const t = useTranslations('operations');
  const showEmptyState = !isPending && roles.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'shield_person'}
        title={isError ? t('administration.roles.errorTitle') : t('administration.roles.emptyTitle')}
        description={
          isError
            ? t('administration.roles.errorDescription')
            : t('administration.roles.emptyDescription')
        }
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('administration.roles.role')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('administration.roles.description')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('administration.roles.members')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('administration.roles.type')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          roles.map((role) => (
            <RolesTableRow
              key={role.id}
              role={role}
              onEdit={onEdit}
              onEditPermissions={onEditPermissions}
              onDelete={onDelete}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
