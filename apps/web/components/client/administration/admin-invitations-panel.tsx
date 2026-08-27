'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UserInvitationView } from '@hms/shared-types';
import { Button, Can, Card, CardContent, Icon, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AdminInvitationsTable } from '#components/client/administration/admin-invitations-table';
import { AdminUserInviteDialog } from '#components/client/administration/admin-user-invite-dialog';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { PageHeader } from '#components/shared/page-header';
import {
  userInvitationAdminControllerResendInvitationV1,
  userInvitationAdminControllerRevokeInvitationV1,
} from '#lib/api/generated/admin-management/admin-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAdminUserQueries } from '#lib/admin-users/invalidate-admin-user-queries';
import { useUserInvitationsList } from '#lib/user-invitations/use-user-invitations-list';

const PAGE_SIZE = 10;

export function AdminInvitationsPanel() {
  const t = useTranslations('operations.administration.invitations');
  const queryClient = useQueryClient();
  const [page, setPage] = useState<number>(1);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState<boolean>(false);
  const invitationsQuery = useUserInvitationsList({ page, limit: PAGE_SIZE });
  const resendMutation = useMutation({
    mutationFn: (id: string) => userInvitationAdminControllerResendInvitationV1(id),
  });
  const revokeMutation = useMutation({
    mutationFn: (id: string) => userInvitationAdminControllerRevokeInvitationV1(id),
  });

  async function handleResend(invitation: UserInvitationView): Promise<void> {
    try {
      const response = await resendMutation.mutateAsync(invitation.id);
      parseApiSuccess<UserInvitationView>(response, t('resendError'));
      toast.success(t('resendSuccess', { email: invitation.email }));
      await invalidateAdminUserQueries(queryClient);
    } catch (error) {
      notifyApiError(error, t('resendError'));
    }
  }

  async function handleRevoke(invitation: UserInvitationView): Promise<void> {
    try {
      const response = await revokeMutation.mutateAsync(invitation.id);
      parseApiSuccess<UserInvitationView>(response, t('revokeError'));
      toast.success(t('revokeSuccess', { email: invitation.email }));
      await invalidateAdminUserQueries(queryClient);
    } catch (error) {
      notifyApiError(error, t('revokeError'));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumbs={[t('title')]}
        actions={
          <Can action="create" subject="User">
            <Button
              type="button"
              className="bg-primary-container hover:bg-primary"
              onClick={() => setIsInviteDialogOpen(true)}
            >
              <Icon name="mail" size={18} />
              {t('inviteUser')}
            </Button>
          </Can>
        }
      />

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <AdminInvitationsTable
            invitations={invitationsQuery.invitations}
            isPending={invitationsQuery.isPending}
            isError={invitationsQuery.isError}
            onResend={(invitation) => void handleResend(invitation)}
            onRevoke={(invitation) => void handleRevoke(invitation)}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={page}
            pageSize={PAGE_SIZE}
            total={invitationsQuery.meta?.total ?? 0}
            itemLabel="invitations"
            isDisabled={invitationsQuery.isFetching}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      {isInviteDialogOpen ? (
        <AdminUserInviteDialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen} />
      ) : null}
    </div>
  );
}
