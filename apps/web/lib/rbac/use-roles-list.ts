import type { RoleListItem } from '@hms/shared-types';

import {
  getRbacControllerGetRolesV1QueryKey,
  rbacControllerGetRolesV1,
} from '#lib/api/generated/rbac/rbac';
import { useApiQuery } from '#lib/api/use-api-query';

export function useRolesList() {
  const query = useApiQuery<RoleListItem[]>({
    queryKey: getRbacControllerGetRolesV1QueryKey(),
    queryFn: (signal) => rbacControllerGetRolesV1(signal),
    errorMessage: 'Failed to load roles',
  });

  return {
    ...query,
    roles: query.data ?? [],
  };
}
