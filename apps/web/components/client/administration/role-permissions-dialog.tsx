'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoleDetail, RoleListItem, SetRolePermissionsInput } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RolePermissionsMatrix } from '#components/client/administration/role-permissions-matrix';
import { rbacControllerSetRolePermissionsV1 } from '#lib/api/generated/rbac/rbac';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateRoleQueries } from '#lib/rbac/invalidate-role-queries';
import { buildPermissionMatrix, togglePermissionKey } from '#lib/rbac/permission-matrix';
import { usePermissionCatalog } from '#lib/rbac/use-permission-catalog';
import { useRoleDetail } from '#lib/rbac/use-role-detail';

type RolePermissionsDialogProps = {
  role: RoleListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RolePermissionsDialog({ role, open, onOpenChange }: RolePermissionsDialogProps) {
  const t = useTranslations('operations.administration.roles');
  const queryClient = useQueryClient();
  const catalogQuery = usePermissionCatalog(open);
  const detailQuery = useRoleDetail(open ? role.id : null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string> | null>(null);
  const saveMutation = useMutation({
    mutationFn: (input: SetRolePermissionsInput) =>
      rbacControllerSetRolePermissionsV1(role.id, input),
  });

  const attachedKeys = detailQuery.role?.permissions.map((entry) => entry.permissionKey);

  // The selection starts as the role's saved set the first time the detail
  // arrives; afterwards it is owned by the checkboxes.
  useEffect(() => {
    if (selectedKeys === null && attachedKeys !== undefined) {
      setSelectedKeys(new Set(attachedKeys));
    }
  }, [selectedKeys, attachedKeys]);

  const isLoading = catalogQuery.isPending || detailQuery.isPending || selectedKeys === null;
  const matrixGroups = buildPermissionMatrix(catalogQuery.groups);

  async function handleSave(): Promise<void> {
    if (selectedKeys === null) {
      return;
    }
    try {
      const response = await saveMutation.mutateAsync({
        permissionKeys: Array.from(selectedKeys).sort(),
      });
      parseApiSuccess<RoleDetail>(response, t('permissionsSaveError'));
      await invalidateRoleQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      notifyApiError(error, t('permissionsSaveError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t('permissionsTitle', { name: role.name })}
          </DialogTitle>
          <DialogDescription>{t('permissionsDescription')}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <RolePermissionsMatrix
              groups={matrixGroups}
              selectedKeys={selectedKeys}
              onToggleKey={(key) => setSelectedKeys(togglePermissionKey(selectedKeys, key))}
            />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={isLoading || saveMutation.isPending}
            className="bg-primary-container hover:bg-primary"
            onClick={() => void handleSave()}
          >
            {saveMutation.isPending ? t('saving') : t('savePermissions')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
