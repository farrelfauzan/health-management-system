'use client';

import type { AdminUser } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AdminUsersTableRow } from '#components/client/administration/admin-users-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 5;

type AdminUsersTableProps = {
  users: AdminUser[];
  isPending: boolean;
  isError: boolean;
  onEdit: (user: AdminUser) => void;
  onToggleActive: (user: AdminUser) => void;
};

export function AdminUsersTable({
  users,
  isPending,
  isError,
  onEdit,
  onToggleActive,
}: AdminUsersTableProps) {
  const t = useTranslations('operations');
  const showEmptyState = !isPending && users.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'admin_panel_settings'}
        title={isError ? t('administration.errorTitle') : t('administration.emptyTitle')}
        description={
          isError ? t('administration.errorDescription') : t('administration.emptyDescription')
        }
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('common.user')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.roles')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.status')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.updated')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          users.map((user) => (
            <AdminUsersTableRow
              key={user.id}
              user={user}
              onEdit={onEdit}
              onToggleActive={onToggleActive}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
