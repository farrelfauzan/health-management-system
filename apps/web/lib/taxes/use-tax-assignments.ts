import type { TaxAssignmentRowView, TaxAssignmentsListMeta } from '@hms/shared-types';

import {
  getTaxAssignmentControllerListAssignmentsV1QueryKey,
  taxAssignmentControllerListAssignmentsV1,
} from '#lib/api/generated/tax-codes/tax-codes';
import type { TaxAssignmentControllerListAssignmentsV1Params } from '#lib/api/generated/model/taxAssignmentControllerListAssignmentsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

/** Stable while loading, so an effect keyed on the list does not rerun every render. */
const NO_ROWS: TaxAssignmentRowView[] = [];

/** One page of tariffs and medications with the tax code each resolves to (P27-T03). */
export function useTaxAssignments(params: TaxAssignmentControllerListAssignmentsV1Params) {
  const result = useApiQuery<TaxAssignmentRowView[]>({
    queryKey: getTaxAssignmentControllerListAssignmentsV1QueryKey(params),
    queryFn: (signal) => taxAssignmentControllerListAssignmentsV1(params, signal),
    errorMessage: 'Unable to load the tariff and medicine tax codes.',
  });

  return {
    ...result,
    rows: result.data ?? NO_ROWS,
    meta: result.meta as TaxAssignmentsListMeta | undefined,
  };
}
