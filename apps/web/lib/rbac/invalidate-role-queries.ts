import type { QueryClient } from '@tanstack/react-query';

import { getRbacControllerGetRolesV1QueryKey } from '#lib/api/generated/rbac/rbac';

/**
 * Drops the roles list and every cached role detail. The detail keys are
 * per-id (`/rbac/roles/:id`), so the list key's path prefix matches them all.
 */
export async function invalidateRoleQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: getRbacControllerGetRolesV1QueryKey(),
  });
}
