'use client';

import type { AdminUser } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';

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
  const showEmptyState = !isPending && users.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'admin_panel_settings'}
        title={isError ? 'Unable to load users' : 'No users found'}
        description={
          isError
            ? 'Something went wrong while fetching system users. It retries automatically.'
            : 'Adjust the filters or add a new user to see records here.'
        }
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>User</DataTableHeaderCell>
          <DataTableHeaderCell>Roles</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell>Updated</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">Actions</DataTableHeaderCell>
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
