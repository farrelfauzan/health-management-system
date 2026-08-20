'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoleDeletion, RoleListItem } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { rbacControllerDeleteRoleV1 } from '#lib/api/generated/rbac/rbac';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateRoleQueries } from '#lib/rbac/invalidate-role-queries';

type RoleDeleteDialogProps = {
  role: RoleListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RoleDeleteDialog({ role, open, onOpenChange }: RoleDeleteDialogProps) {
  const t = useTranslations('operations.administration.roles');
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => rbacControllerDeleteRoleV1(role.id),
  });

  async function handleDelete(): Promise<void> {
    try {
      const response = await deleteMutation.mutateAsync();
      const envelope = parseApiSuccess<RoleDeletion>(response, t('deleteError'));
      toast.success(t('deleteSuccess', { count: envelope.data.revokedAssignmentCount }));
      await invalidateRoleQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      notifyApiError(error, t('deleteError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t('deleteTitle', { name: role.name })}
          </DialogTitle>
          <DialogDescription>
            {t('deleteDescription', { count: role.memberCount })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => void handleDelete()}
          >
            {deleteMutation.isPending ? t('deleting') : t('confirmDelete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
