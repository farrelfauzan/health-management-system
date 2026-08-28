'use client';

import type {
  CreateOrganizationUnitInput,
  OrganizationUnitKindValue,
  OrganizationUnitTreeNode,
  UpdateOrganizationUnitInput,
} from '@hms/shared-types';
import { ORGANIZATION_UNIT_KINDS } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
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
import {
  organizationUnitControllerCreateUnitV1,
  organizationUnitControllerUpdateUnitV1,
} from '#lib/api/generated/organization-structure/organization-structure';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateOrganizationQueries } from '#lib/organization/invalidate-organization-queries';

type OrganizationUnitFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The unit being edited, or null when creating. */
  unit: OrganizationUnitTreeNode | null;
  /** The parent to create under, or null for a root. Ignored when editing. */
  parent: OrganizationUnitTreeNode | null;
};

export function OrganizationUnitFormDialog({
  open,
  onOpenChange,
  unit,
  parent,
}: OrganizationUnitFormDialogProps) {
  const t = useTranslations('operations.organization');
  const common = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const isEditing = unit !== null;
  const [name, setName] = useState<string>(unit?.name ?? '');
  const [kind, setKind] = useState<OrganizationUnitKindValue>(unit?.kind ?? 'DEPARTMENT');
  const [actionError, setActionError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: CreateOrganizationUnitInput | UpdateOrganizationUnitInput) =>
      isEditing
        ? organizationUnitControllerUpdateUnitV1(unit.id, payload as UpdateOrganizationUnitInput)
        : organizationUnitControllerCreateUnitV1(payload as CreateOrganizationUnitInput),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      setActionError(t('requiredFields'));
      return;
    }

    // `parentId` is absent from the edit payload on purpose: re-parenting is
    // its own endpoint, because it rewrites every descendant's ancestry and can
    // be refused for depth or a cycle.
    const payload = isEditing
      ? { name: trimmedName, kind }
      : { name: trimmedName, kind, parentId: parent?.id ?? null };

    try {
      parseApiSuccess(await saveMutation.mutateAsync(payload), t('saveError'));
      await invalidateOrganizationQueries(queryClient);
      toast.success(
        isEditing
          ? t('updateSuccess', { name: trimmedName })
          : t('createSuccess', { name: trimmedName }),
      );
      onOpenChange(false);
    } catch (err) {
      // The API's depth refusal arrives here as a specific message, so it is
      // shown inline rather than collapsed into a generic save failure.
      setActionError(notifyApiError(err, t('saveError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('editUnit') : t('newUnit')}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? t('subtitle')
              : parent
                ? t('parent') + ': ' + parent.name
                : t('topLevel')}
          </DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="organization-unit-name">{t('name')}</Label>
            <Input
              id="organization-unit-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organization-unit-kind">{t('kind')}</Label>
            <Select
              value={kind}
              onValueChange={(value) => setKind(value as OrganizationUnitKindValue)}
            >
              <SelectTrigger id="organization-unit-kind" className="w-full">
                <SelectValue placeholder={t('kind')} />
              </SelectTrigger>
              <SelectContent>
                {ORGANIZATION_UNIT_KINDS.map((unitKind) => (
                  <SelectItem key={unitKind} value={unitKind}>
                    {t(`kinds.${unitKind}`)}
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {common('cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? common('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
