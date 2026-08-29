'use client';

import type { OrganizationUnitMemberResponse, OrganizationUnitTreeNode } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  TableBody,
  TableHeader,
  TableRow,
  useAbility,
} from '@hms/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { OrganizationUnitMemberAddRow } from '#components/client/organization/organization-unit-member-add-row';
import { OrganizationUnitMemberRow } from '#components/client/organization/organization-unit-member-row';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';
import { notifyApiError } from '#lib/api/notify-api-error';
import { organizationUnitMemberControllerUnassignMemberV1 } from '#lib/api/generated/organization-structure/organization-structure';
import { invalidateOrganizationQueries } from '#lib/organization/invalidate-organization-queries';
import { useOrganizationUnitMembers } from '#lib/organization/use-organization-unit-members';

const MEMBERS_PAGE_SIZE = 20;

const TABLE_COLUMN_COUNT = 4;

type OrganizationUnitMembersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: OrganizationUnitTreeNode;
};

/**
 * The roster for one unit (SJ-89), opened from a row on the org chart rather
 * than bolted onto the admin-user form. This is where someone mid-reorganisation
 * looks: they are already staring at the box they want to fill.
 *
 * Gated on `manage` / `OrganizationUnitMember`, which is a *different* grant
 * from the one that lets someone redraw the chart — so a structure editor sees
 * this list read-only. Visibility only; the API enforces both.
 */
export function OrganizationUnitMembersDialog({
  open,
  onOpenChange,
  unit,
}: OrganizationUnitMembersDialogProps) {
  const t = useTranslations('operations.organization');
  const common = useTranslations('operations.common');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const [page, setPage] = useState<number>(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const membersQuery = useOrganizationUnitMembers(unit.id, {
    page,
    limit: MEMBERS_PAGE_SIZE,
  });
  const isArchived = unit.archivedAt !== undefined;
  const canManageMembers = ability.can('manage', 'OrganizationUnitMember') && !isArchived;

  async function handleRemove(member: OrganizationUnitMemberResponse): Promise<void> {
    setActionError(null);
    try {
      await organizationUnitMemberControllerUnassignMemberV1(unit.id, member.userId);
      await invalidateOrganizationQueries(queryClient);
    } catch (err) {
      setActionError(notifyApiError(err, t('removeError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t('membersTitle', { name: unit.name })}
          </DialogTitle>
          <DialogDescription>
            {isArchived ? t('archivedNoAssign') : t('membersDescription')}
          </DialogDescription>
        </DialogHeader>

        {canManageMembers ? (
          <OrganizationUnitMemberAddRow
            unit={unit}
            assignedUserIds={membersQuery.members.map((member) => member.userId)}
            onError={setActionError}
          />
        ) : null}

        {actionError ? (
          <p role="alert" className="text-sm text-danger">
            {actionError}
          </p>
        ) : null}

        {!membersQuery.isPending && membersQuery.members.length === 0 ? (
          <EmptyState
            icon={membersQuery.isError ? 'error' : 'group'}
            title={membersQuery.isError ? t('membersLoadError') : t('emptyMembers')}
            description={
              membersQuery.isError
                ? t('loadErrorDescription')
                : canManageMembers
                  ? t('emptyMembersDescription')
                  : t('emptyMembersReadOnly')
            }
          />
        ) : (
          <>
            <DataTable minWidthClassName="min-w-[36rem]">
              <TableHeader>
                <TableRow>
                  <DataTableHeaderCell>{t('memberEmail')}</DataTableHeaderCell>
                  <DataTableHeaderCell>{t('memberRoles')}</DataTableHeaderCell>
                  <DataTableHeaderCell>{t('memberStatus')}</DataTableHeaderCell>
                  <DataTableHeaderCell className="text-right">
                    {common('actions')}
                  </DataTableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membersQuery.isPending ? (
                  <TableSkeleton columns={TABLE_COLUMN_COUNT} />
                ) : (
                  membersQuery.members.map((member) => (
                    <OrganizationUnitMemberRow
                      key={member.userId}
                      member={member}
                      canManage={canManageMembers}
                      onRemove={(target) => void handleRemove(target)}
                    />
                  ))
                )}
              </TableBody>
            </DataTable>
            <NumberedPagination
              page={page}
              pageSize={MEMBERS_PAGE_SIZE}
              total={membersQuery.meta?.total ?? 0}
              itemLabel="members"
              isDisabled={membersQuery.isFetching}
              onPageChange={setPage}
            />
          </>
        )}

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {common('close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
