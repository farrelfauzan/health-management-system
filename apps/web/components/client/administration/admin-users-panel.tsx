'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminUser } from '@hms/shared-types';
import { Button, Can, Card, CardContent, Icon } from '@hms/ui';
import { usePathname, useRouter } from 'next/navigation';

import { AdminUserFormDialog } from '#components/client/administration/admin-user-form-dialog';
import {
  AdminUsersFilterCard,
  type AdminUsersFilterValues,
} from '#components/client/administration/admin-users-filter-card';
import { AdminUsersTable } from '#components/client/administration/admin-users-table';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { PageHeader } from '#components/shared/page-header';
import { adminManagementControllerUpdateAdminUserV1 } from '#lib/api/generated/admin-management/admin-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAdminUserQueries } from '#lib/admin-users/invalidate-admin-user-queries';
import {
  buildAdminUsersSearchParams,
  type AdminUsersSearchParams,
} from '#lib/admin-users/search-params';
import { useAdminUsersList } from '#lib/admin-users/use-admin-users-list';
import { ADMIN_ROUTE_METADATA } from '#lib/shell/route-metadata';

const TOGGLE_ERROR_FALLBACK = 'Unable to update the user status. Please try again.';

type AdminUsersPanelProps = {
  initialQuery: AdminUsersSearchParams;
};

export function AdminUsersPanel({ initialQuery }: AdminUsersPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const metadata = ADMIN_ROUTE_METADATA.administration;
  const queryClient = useQueryClient();
  const usersQuery = useAdminUsersList(initialQuery);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminManagementControllerUpdateAdminUserV1(id, { isActive }),
  });

  function navigateWithParams(next: AdminUsersSearchParams): void {
    router.replace(`${pathname}?${buildAdminUsersSearchParams(next).toString()}`);
  }

  function handleApplyFilters(filters: AdminUsersFilterValues): void {
    navigateWithParams({
      page: 1,
      limit: initialQuery.limit,
      ...filters,
    });
  }

  function handleResetFilters(): void {
    navigateWithParams({ page: 1, limit: initialQuery.limit });
  }

  function handleOpenCreateDialog(): void {
    setEditingUser(null);
    setIsFormDialogOpen(true);
  }

  function handleOpenEditDialog(user: AdminUser): void {
    setEditingUser(user);
    setIsFormDialogOpen(true);
  }

  async function handleToggleActive(user: AdminUser): Promise<void> {
    try {
      const response = await toggleActiveMutation.mutateAsync({
        id: user.id,
        isActive: !user.isActive,
      });
      parseApiSuccess<AdminUser>(response, TOGGLE_ERROR_FALLBACK);
      await invalidateAdminUserQueries(queryClient);
    } catch (error) {
      notifyApiError(error, TOGGLE_ERROR_FALLBACK);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={metadata.title}
        subtitle={metadata.subtitle}
        breadcrumbs={metadata.breadcrumbs}
        actions={
          <Can action="create" subject="User">
            <Button
              type="button"
              className="bg-primary-container hover:bg-primary"
              onClick={handleOpenCreateDialog}
            >
              <Icon name="person_add" size={18} />
              Add New User
            </Button>
          </Can>
        }
      />

      <AdminUsersFilterCard
        key={`${initialQuery.search ?? ''}|${initialQuery.roleCode ?? ''}|${initialQuery.isActive ?? ''}`}
        initialQuery={initialQuery}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
      />

      {usersQuery.error && usersQuery.users.length > 0 ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {usersQuery.error.message}
        </p>
      ) : null}

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <AdminUsersTable
            users={usersQuery.users}
            isPending={usersQuery.isPending}
            isError={usersQuery.isError}
            onEdit={handleOpenEditDialog}
            onToggleActive={(user) => void handleToggleActive(user)}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={initialQuery.page}
            pageSize={initialQuery.limit}
            total={usersQuery.meta?.total ?? 0}
            itemLabel="users"
            isDisabled={usersQuery.isFetching}
            onPageChange={(nextPage) => navigateWithParams({ ...initialQuery, page: nextPage })}
          />
        </CardContent>
      </Card>

      {isFormDialogOpen ? (
        <AdminUserFormDialog
          key={editingUser?.id ?? 'create'}
          open={isFormDialogOpen}
          onOpenChange={(open) => {
            setIsFormDialogOpen(open);
            if (!open) {
              setEditingUser(null);
            }
          }}
          user={editingUser}
        />
      ) : null}
    </div>
  );
}
