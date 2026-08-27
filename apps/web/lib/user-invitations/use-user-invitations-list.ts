import type { UserInvitationView, UserInvitationsListMeta } from '@hms/shared-types';

import {
  getUserInvitationAdminControllerListInvitationsV1QueryKey,
  userInvitationAdminControllerListInvitationsV1,
} from '#lib/api/generated/admin-management/admin-management';
import type { UserInvitationAdminControllerListInvitationsV1Params } from '#lib/api/generated/model/userInvitationAdminControllerListInvitationsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

export function useUserInvitationsList(
  params: UserInvitationAdminControllerListInvitationsV1Params,
) {
  const query = useApiQuery<UserInvitationView[]>({
    queryKey: getUserInvitationAdminControllerListInvitationsV1QueryKey(params),
    queryFn: (signal) => userInvitationAdminControllerListInvitationsV1(params, signal),
    errorMessage: 'Failed to load invitations',
  });

  return {
    ...query,
    invitations: query.data ?? [],
    meta: query.meta as UserInvitationsListMeta | undefined,
  };
}
