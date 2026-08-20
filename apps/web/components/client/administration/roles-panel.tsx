'use client';

import { useState } from 'react';
import type { RoleListItem } from '@hms/shared-types';
import { Button, Can, Card, CardContent, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RoleDeleteDialog } from '#components/client/administration/role-delete-dialog';
import { RoleFormDialog } from '#components/client/administration/role-form-dialog';
import { RolePermissionsDialog } from '#components/client/administration/role-permissions-dialog';
import { RolesTable } from '#components/client/administration/roles-table';
import { PageHeader } from '#components/shared/page-header';
import { useRolesList } from '#lib/rbac/use-roles-list';

export function RolesPanel() {
  const t = useTranslations('operations.administration.roles');
  const rolesQuery = useRolesList();
  const [isFormDialogOpen, setIsFormDialogOpen] = useState<boolean>(false);
  const [editingRole, setEditingRole] = useState<RoleListItem | null>(null);
  const [permissionsRole, setPermissionsRole] = useState<RoleListItem | null>(null);
  const [deletingRole, setDeletingRole] = useState<RoleListItem | null>(null);

  function handleOpenCreateDialog(): void {
    setEditingRole(null);
    setIsFormDialogOpen(true);
  }

  function handleOpenEditDialog(role: RoleListItem): void {
    setEditingRole(role);
    setIsFormDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumbs={[t('title')]}
        actions={
          <Can action="create" subject="Role">
            <Button
              type="button"
              className="bg-primary-container hover:bg-primary"
              onClick={handleOpenCreateDialog}
            >
              <Icon name="add_moderator" size={18} />
              {t('addRole')}
            </Button>
          </Can>
        }
      />

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <RolesTable
            roles={rolesQuery.roles}
            isPending={rolesQuery.isPending}
            isError={rolesQuery.isError}
            onEdit={handleOpenEditDialog}
            onEditPermissions={setPermissionsRole}
            onDelete={setDeletingRole}
          />
        </CardContent>
      </Card>

      {isFormDialogOpen ? (
        <RoleFormDialog
          key={editingRole?.id ?? 'create'}
          open={isFormDialogOpen}
          onOpenChange={(open) => {
            setIsFormDialogOpen(open);
            if (!open) {
              setEditingRole(null);
            }
          }}
          role={editingRole}
        />
      ) : null}

      {permissionsRole ? (
        <RolePermissionsDialog
          key={permissionsRole.id}
          role={permissionsRole}
          open={permissionsRole !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPermissionsRole(null);
            }
          }}
        />
      ) : null}

      {deletingRole ? (
        <RoleDeleteDialog
          key={deletingRole.id}
          role={deletingRole}
          open={deletingRole !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDeletingRole(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}
