import {
  FAMILY_PLANNING_DUE_DEFAULT_WITHIN_DAYS,
  type FamilyPlanningDueItem,
} from '@hms/shared-types';

import {
  familyPlanningControllerListDueV1,
  getFamilyPlanningControllerListDueV1QueryKey,
} from '#lib/api/generated/maternal-care/maternal-care';
import { useApiQuery } from '#lib/api/use-api-query';

/** Live KB courses due within the week or overdue (P25-T14). */
export function useFamilyPlanningDue(isEnabled: boolean) {
  const params = { withinDays: FAMILY_PLANNING_DUE_DEFAULT_WITHIN_DAYS };
  const query = useApiQuery<FamilyPlanningDueItem[]>({
    queryKey: getFamilyPlanningControllerListDueV1QueryKey(params),
    queryFn: (signal) => familyPlanningControllerListDueV1(params, signal),
    errorMessage: 'Failed to load the family planning due list',
    enabled: isEnabled,
  });

  return { ...query, items: query.data ?? [] };
}
