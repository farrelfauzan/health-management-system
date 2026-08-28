'use client';

import type { OrganizationUnitTreeNode } from '@hms/shared-types';
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { notifyApiError } from '#lib/api/notify-api-error';
import { organizationUnitControllerDeleteUnitV1 } from '#lib/api/generated/organization-structure/organization-structure';
import { invalidateOrganizationQueries } from '#lib/organization/invalidate-organization-queries';

type OrganizationUnitDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: OrganizationUnitTreeNode;
};

export function OrganizationUnitDeleteDialog({
  open,
  onOpenChange,
  unit,
}: OrganizationUnitDeleteDialogProps) {
  const t = useTranslations('operations.organization');
  const common = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: () => organizationUnitControllerDeleteUnitV1(unit.id),
  });

  async function handleDelete(): Promise<void> {
    setActionError(null);
    try {
      await deleteMutation.mutateAsync();
      await invalidateOrganizationQueries(queryClient);
      toast.success(t('deleteSuccess', { name: unit.name }));
      onOpenChange(false);
    } catch (err) {
      // Two distinct 409s live behind this — sub-units remaining, or members
      // still assigned — and each names what to clear first. Collapsing them
      // into "could not delete" would leave the operator guessing which.
      setActionError(notifyApiError(err, t('deleteError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t('deleteTitle', { name: unit.name })}
          </DialogTitle>
          <DialogDescription>{t('deleteDescription')}</DialogDescription>
        </DialogHeader>
        {actionError ? (
          <p role="alert" className="text-sm text-danger">
            {actionError}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {common('cancel')}
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
