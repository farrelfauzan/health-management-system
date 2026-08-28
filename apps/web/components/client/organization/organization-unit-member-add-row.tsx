'use client';

import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import {
  Button,
  Icon,
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
import { organizationUnitMemberControllerAssignMemberV1 } from '#lib/api/generated/organization-structure/organization-structure';
import { parseApiSuccess } from '#lib/api/response';
import { useAdminUsersList } from '#lib/admin-users/use-admin-users-list';
import { invalidateOrganizationQueries } from '#lib/organization/invalidate-organization-queries';

/**
 * How many staff accounts the picker offers. A clinic's whole staff list fits
 * comfortably; a searchable picker is a follow-up if one ever does not.
 */
const STAFF_OPTIONS_LIMIT = 100;

type OrganizationUnitMemberAddRowProps = {
  unit: OrganizationUnitTreeNode;
  /** Already in this unit, so they are filtered out of the picker. */
  assignedUserIds: string[];
  onError: (message: string | null) => void;
};

export function OrganizationUnitMemberAddRow({
  unit,
  assignedUserIds,
  onError,
}: OrganizationUnitMemberAddRowProps) {
  const t = useTranslations('operations.organization');
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const usersQuery = useAdminUsersList({ page: 1, limit: STAFF_OPTIONS_LIMIT, isActive: 'true' });
  const assignMutation = useMutation({
    mutationFn: (userId: string) =>
      organizationUnitMemberControllerAssignMemberV1(unit.id, userId),
  });
  // Only this unit's members are excluded, not everyone who already sits
  // somewhere: assigning someone from another unit is a reassignment, which is
  // the ordinary way a person moves and must stay one click.
  const assignedIds = new Set(assignedUserIds);
  const options = usersQuery.users.filter((user) => !assignedIds.has(user.id));

  async function handleAssign(): Promise<void> {
    if (!selectedUserId) {
      return;
    }
    onError(null);
    const selected = options.find((user) => user.id === selectedUserId);
    try {
      parseApiSuccess(await assignMutation.mutateAsync(selectedUserId), t('assignError'));
      await invalidateOrganizationQueries(queryClient);
      toast.success(t('assignSuccess', { email: selected?.email ?? '', name: unit.name }));
      setSelectedUserId('');
    } catch (err) {
      onError(notifyApiError(err, t('assignError')));
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-3">
      <div className="min-w-56 flex-1 space-y-2">
        <Label htmlFor="organization-member-picker">{t('selectStaff')}</Label>
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger id="organization-member-picker" className="w-full">
            <SelectValue placeholder={t('selectStaffPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {options.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!usersQuery.isPending && options.length === 0 ? (
          <p className="text-sm text-warning">{t('noAssignableStaff')}</p>
        ) : null}
      </div>
      <Button
        type="button"
        className="bg-primary-container hover:bg-primary"
        disabled={!selectedUserId || assignMutation.isPending}
        onClick={() => void handleAssign()}
      >
        <Icon name="person_add" size={18} />
        {assignMutation.isPending ? t('adding') : t('addMember')}
      </Button>
    </div>
  );
}
