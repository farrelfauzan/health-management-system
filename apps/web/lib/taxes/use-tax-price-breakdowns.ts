import type { TaxAssignmentKindValue, TaxPriceBreakdownView } from '@hms/shared-types';
import { useMemo } from 'react';

import {
  getTaxPriceBreakdownControllerListPriceBreakdownsV1QueryKey,
  taxPriceBreakdownControllerListPriceBreakdownsV1,
} from '#lib/api/generated/tax-codes/tax-codes';
import { useApiQuery } from '#lib/api/use-api-query';

type UseTaxPriceBreakdownsParams = {
  kind: TaxAssignmentKindValue;
  ids: readonly string[];
  /** Only an administrator who may read tax codes asks; everyone else sees the list as before. */
  enabled: boolean;
};

/**
 * The before/after-PPN figures for one page of tariffs or medicines (P27-T04).
 * `breakdownById` is `null` until the answer arrives — and stays null when the
 * clinic has no tax module (the API refuses), so the columns never appear.
 */
export function useTaxPriceBreakdowns({ kind, ids, enabled }: UseTaxPriceBreakdownsParams) {
  const params = { kind, ids: ids.join(',') };
  const result = useApiQuery<TaxPriceBreakdownView[]>({
    queryKey: getTaxPriceBreakdownControllerListPriceBreakdownsV1QueryKey(params),
    queryFn: (signal) => taxPriceBreakdownControllerListPriceBreakdownsV1(params, signal),
    errorMessage: 'Unable to load the PPN breakdown.',
    enabled: enabled && ids.length > 0,
    options: { retry: false },
  });
  const breakdownById = useMemo(
    () =>
      result.isSuccess && result.data
        ? new Map(result.data.map((row) => [row.id, row] as const))
        : null,
    [result.isSuccess, result.data],
  );
  return { breakdownById };
}
