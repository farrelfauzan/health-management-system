import type { OrganizationUnitTreeResponse } from '@hms/shared-types';

import type { OrganizationUnitControllerGetTreeV1Params } from '#lib/api/generated/model/organizationUnitControllerGetTreeV1Params';
import {
  getOrganizationUnitControllerGetTreeV1QueryKey,
  organizationUnitControllerGetTreeV1,
} from '#lib/api/generated/organization-structure/organization-structure';
import { useApiQuery } from '#lib/api/use-api-query';

const EMPTY_TREE: OrganizationUnitTreeResponse = { roots: [], totalUnits: 0, maxDepth: 0 };

/**
 * The whole org chart in one request (SJ-1). There is no pagination here on
 * purpose: the API returns the tree nested and the screen draws all of it, so
 * a page boundary would cut branches off their parents.
 */
export function useOrganizationTree(params: OrganizationUnitControllerGetTreeV1Params = {}) {
  const query = useApiQuery<OrganizationUnitTreeResponse>({
    queryKey: getOrganizationUnitControllerGetTreeV1QueryKey(params),
    queryFn: (signal) => organizationUnitControllerGetTreeV1(params, signal),
    errorMessage: 'Failed to load the organization structure',
  });

  return {
    ...query,
    tree: query.data ?? EMPTY_TREE,
  };
}
