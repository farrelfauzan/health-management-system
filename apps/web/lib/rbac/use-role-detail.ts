import type { RoleDetail } from '@hms/shared-types';

import {
  getRbacControllerGetRoleByIdV1QueryKey,
  rbacControllerGetRoleByIdV1,
} from '#lib/api/generated/rbac/rbac';
import { useApiQuery } from '#lib/api/use-api-query';

export function useRoleDetail(roleId: string | null) {
  const query = useApiQuery<RoleDetail>({
    queryKey: getRbacControllerGetRoleByIdV1QueryKey(roleId ?? ''),
    queryFn: (signal) => rbacControllerGetRoleByIdV1(roleId ?? '', signal),
    errorMessage: 'Failed to load the role',
    enabled: roleId !== null,
  });

  return {
    ...query,
    role: query.data ?? null,
  };
}
