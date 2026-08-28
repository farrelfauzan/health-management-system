import type {
  OrganizationUnitMemberListMeta,
  OrganizationUnitMemberResponse,
} from '@hms/shared-types';

import type { OrganizationUnitMemberControllerListMembersV1Params } from '#lib/api/generated/model/organizationUnitMemberControllerListMembersV1Params';
import {
  getOrganizationUnitMemberControllerListMembersV1QueryKey,
  organizationUnitMemberControllerListMembersV1,
} from '#lib/api/generated/organization-structure/organization-structure';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The roster of one unit (SJ-89). Paginated, unlike the tree — a clinic caps at
 * six levels but a department can hold three hundred people.
 */
export function useOrganizationUnitMembers(
  organizationUnitId: string,
  params: OrganizationUnitMemberControllerListMembersV1Params = {},
  isEnabled = true,
) {
  const query = useApiQuery<OrganizationUnitMemberResponse[]>({
    queryKey: getOrganizationUnitMemberControllerListMembersV1QueryKey(organizationUnitId, params),
    queryFn: (signal) =>
      organizationUnitMemberControllerListMembersV1(organizationUnitId, params, signal),
    errorMessage: 'Failed to load the unit members',
    enabled: isEnabled,
  });

  return {
    ...query,
    members: query.data ?? [],
    meta: query.meta as OrganizationUnitMemberListMeta | undefined,
  };
}
