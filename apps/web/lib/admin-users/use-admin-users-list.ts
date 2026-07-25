import type { AdminUser, AdminUsersListMeta } from '@hms/shared-types';

import {
  adminManagementControllerListUsersV1,
  getAdminManagementControllerListUsersV1QueryKey,
} from '#lib/api/generated/admin-management/admin-management';
import type { AdminManagementControllerListUsersV1Params } from '#lib/api/generated/model/adminManagementControllerListUsersV1Params';
import { useApiQuery } from '#lib/api/use-api-query';
import type { AdminUsersSearchParams } from '#lib/admin-users/search-params';

export function useAdminUsersList(params: AdminUsersSearchParams) {
  const requestParams: AdminManagementControllerListUsersV1Params = {
    page: params.page,
    limit: params.limit,
    search: params.search,
    roleCode: params.roleCode,
    isActive: params.isActive,
  };

  const query = useApiQuery<AdminUser[]>({
    queryKey: getAdminManagementControllerListUsersV1QueryKey(requestParams),
    queryFn: (signal) => adminManagementControllerListUsersV1(requestParams, signal),
    errorMessage: 'Failed to load admin users',
  });

  return {
    ...query,
    users: query.data ?? [],
    meta: query.meta as AdminUsersListMeta | undefined,
  };
}
