'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminUser } from '@hms/shared-types';
import { Button, Can, Card, CardContent, Icon } from '@hms/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { AdminUserFormDialog } from '#components/client/administration/admin-user-form-dialog';
import { AdminUserInviteDialog } from '#components/client/administration/admin-user-invite-dialog';
import { AdminUserOffboardingDialog } from '#components/client/administration/admin-user-offboarding-dialog';
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

type AdminUsersPanelProps = {
  initialQuery: AdminUsersSearchParams;
};

export function AdminUsersPanel({ initialQuery }: AdminUsersPanelProps) {
  const t = useTranslations('operations.administration');
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const usersQuery = useAdminUsersList(initialQuery);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [offboardingUser, setOffboardingUser] = useState<AdminUser | null>(null);
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

  function handleOpenEditDialog(user: AdminUser): void {
    setEditingUser(user);
  }

  async function handleToggleActive(user: AdminUser): Promise<void> {
    try {
      const response = await toggleActiveMutation.mutateAsync({
        id: user.id,
        isActive: !user.isActive,
      });
      parseApiSuccess<AdminUser>(response, t('toggleError'));
      await invalidateAdminUserQueries(queryClient);
    } catch (error) {
      notifyApiError(error, t('toggleError'));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumbs={[t('title')]}
        actions={
          <Can action="create" subject="User">
            <Button
              type="button"
              className="bg-primary-container hover:bg-primary"
              onClick={() => setIsInviteDialogOpen(true)}
            >
              <Icon name="person_add" size={18} />
              {t('invitations.inviteUser')}
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
          {t('errorTitle')}
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
            onOffboard={setOffboardingUser}
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

      {editingUser ? (
        <AdminUserFormDialog
          key={editingUser.id}
          open
          onOpenChange={(open) => {
            if (!open) {
              setEditingUser(null);
            }
          }}
          user={editingUser}
        />
      ) : null}

      {offboardingUser ? (
        <AdminUserOffboardingDialog
          key={offboardingUser.id}
          open
          onOpenChange={(open) => {
            if (!open) {
              setOffboardingUser(null);
            }
          }}
          user={offboardingUser}
        />
      ) : null}

      {isInviteDialogOpen ? (
        <AdminUserInviteDialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen} />
      ) : null}
    </div>
  );
}
