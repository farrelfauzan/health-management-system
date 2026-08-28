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
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { notifyApiError } from '#lib/api/notify-api-error';
import { organizationUnitControllerMoveUnitV1 } from '#lib/api/generated/organization-structure/organization-structure';
import { parseApiSuccess } from '#lib/api/response';
import { collectSubtreeIds } from '#lib/organization/collect-subtree-ids';
import { flattenOrganizationTree } from '#lib/organization/flatten-organization-tree';
import { invalidateOrganizationQueries } from '#lib/organization/invalidate-organization-queries';

/**
 * `Select` cannot carry a null value, so the "promote to root" choice needs a
 * sentinel. A non-UUID string is safe: every real option is a unit id.
 */
const ROOT_OPTION_VALUE = '__root__';

type OrganizationUnitMoveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: OrganizationUnitTreeNode;
  roots: OrganizationUnitTreeNode[];
};

/**
 * An explicit picker rather than drag-and-drop (SJ-2). A move re-parents a
 * whole subtree and can be refused for depth or a cycle, so the destination is
 * worth naming deliberately — and a dropped branch that bounces back with a
 * validation error is a worse way to learn that than a disabled option.
 */
export function OrganizationUnitMoveDialog({
  open,
  onOpenChange,
  unit,
  roots,
}: OrganizationUnitMoveDialogProps) {
  const t = useTranslations('operations.organization');
  const common = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const [parentId, setParentId] = useState<string>(unit.parentId ?? ROOT_OPTION_VALUE);
  const [actionError, setActionError] = useState<string | null>(null);
  const moveMutation = useMutation({
    mutationFn: (nextParentId: string | null) =>
      organizationUnitControllerMoveUnitV1(unit.id, { parentId: nextParentId }),
  });
  const excludedIds = collectSubtreeIds(unit);
  // Archived units are left out too: the API refuses them as a parent, and an
  // option that always fails is worse than no option.
  const destinations = flattenOrganizationTree(roots).filter(
    (row) => !excludedIds.has(row.unit.id) && row.unit.archivedAt === undefined,
  );

  async function handleMove(): Promise<void> {
    setActionError(null);
    try {
      const nextParentId = parentId === ROOT_OPTION_VALUE ? null : parentId;
      parseApiSuccess(await moveMutation.mutateAsync(nextParentId), t('moveError'));
      await invalidateOrganizationQueries(queryClient);
      toast.success(t('moveSuccess', { name: unit.name }));
      onOpenChange(false);
    } catch (err) {
      // A depth or cycle refusal comes back with its own message; showing it
      // inline is the difference between "try a shallower parent" and "it
      // didn't work".
      setActionError(notifyApiError(err, t('moveError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('moveTitle', { name: unit.name })}</DialogTitle>
          <DialogDescription>{t('moveDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="organization-move-parent">{t('moveTo')}</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger id="organization-move-parent" className="w-full">
                <SelectValue placeholder={t('moveTo')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT_OPTION_VALUE}>{t('topLevel')}</SelectItem>
                {destinations.map((row) => (
                  <SelectItem key={row.unit.id} value={row.unit.id}>
                    {' '.repeat(row.indent * 2) + row.unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {actionError ? (
            <p role="alert" className="text-sm text-danger">
              {actionError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {common('cancel')}
          </Button>
          <Button type="button" disabled={moveMutation.isPending} onClick={() => void handleMove()}>
            {moveMutation.isPending ? t('moving') : t('confirmMove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
