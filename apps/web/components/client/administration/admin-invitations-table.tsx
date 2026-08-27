'use client';

import type { UserInvitationView } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AdminInvitationsTableRow } from '#components/client/administration/admin-invitations-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 5;

type AdminInvitationsTableProps = {
  invitations: UserInvitationView[];
  isPending: boolean;
  isError: boolean;
  onResend: (invitation: UserInvitationView) => void;
  onRevoke: (invitation: UserInvitationView) => void;
};

export function AdminInvitationsTable({
  invitations,
  isPending,
  isError,
  onResend,
  onRevoke,
}: AdminInvitationsTableProps) {
  const t = useTranslations('operations.administration.invitations');
  const showEmptyState = !isPending && invitations.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'mail'}
        title={isError ? t('errorTitle') : t('emptyTitle')}
        description={isError ? t('errorDescription') : t('emptyDescription')}
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('recipient')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('roles')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('statusColumn')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('expires')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          invitations.map((invitation) => (
            <AdminInvitationsTableRow
              key={invitation.id}
              invitation={invitation}
              onResend={onResend}
              onRevoke={onRevoke}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
