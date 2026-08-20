import type { PermissionCatalogGroup } from '@hms/shared-types';

import {
  getRbacControllerGetPermissionCatalogV1QueryKey,
  rbacControllerGetPermissionCatalogV1,
} from '#lib/api/generated/rbac/rbac';
import { useApiQuery } from '#lib/api/use-api-query';

export function usePermissionCatalog(enabled: boolean = true) {
  const query = useApiQuery<PermissionCatalogGroup[]>({
    queryKey: getRbacControllerGetPermissionCatalogV1QueryKey(),
    queryFn: (signal) => rbacControllerGetPermissionCatalogV1(signal),
    errorMessage: 'Failed to load the permission catalog',
    enabled,
    // The catalog is seed-owned and changes only on deploy; refetching it per
    // dialog open is pure noise.
    options: { staleTime: Infinity },
  });

  return {
    ...query,
    groups: query.data ?? [],
  };
}
