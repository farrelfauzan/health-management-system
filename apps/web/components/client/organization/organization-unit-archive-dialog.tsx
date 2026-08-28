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
import { organizationUnitControllerArchiveUnitV1 } from '#lib/api/generated/organization-structure/organization-structure';
import { invalidateOrganizationQueries } from '#lib/organization/invalidate-organization-queries';

type OrganizationUnitArchiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: OrganizationUnitTreeNode;
};

export function OrganizationUnitArchiveDialog({
  open,
  onOpenChange,
  unit,
}: OrganizationUnitArchiveDialogProps) {
  const t = useTranslations('operations.organization');
  const common = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const archiveMutation = useMutation({
    mutationFn: () => organizationUnitControllerArchiveUnitV1(unit.id),
  });

  async function handleArchive(): Promise<void> {
    setActionError(null);
    try {
      await archiveMutation.mutateAsync();
      await invalidateOrganizationQueries(queryClient);
      toast.success(t('archiveSuccess', { name: unit.name }));
      onOpenChange(false);
    } catch (err) {
      // The API refuses this with a 409 while live sub-units remain, and that
      // message names the count — so it stays in the dialog the operator is
      // looking at rather than only in a toast that scrolls away.
      setActionError(notifyApiError(err, t('archiveError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t('archiveTitle', { name: unit.name })}
          </DialogTitle>
          <DialogDescription>
            {t('archiveDescription', { count: unit.memberCount })}
          </DialogDescription>
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
            disabled={archiveMutation.isPending}
            onClick={() => void handleArchive()}
          >
            {archiveMutation.isPending ? t('archiving') : t('confirmArchive')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
