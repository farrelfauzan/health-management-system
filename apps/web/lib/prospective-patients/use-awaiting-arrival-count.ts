import type { ProspectivePatientsListMeta, ProspectivePatientView } from '@hms/shared-types';

import {
  getProspectivePatientControllerListProspectivePatientsV1QueryKey,
  prospectivePatientControllerListProspectivePatientsV1,
} from '#lib/api/generated/customer-service/customer-service';
import type { ProspectivePatientControllerListProspectivePatientsV1Params } from '#lib/api/generated/model/prospectivePatientControllerListProspectivePatientsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

/** Matches the table's own poll, so the badge and the rows never disagree for long. */
const AWAITING_COUNT_POLL_INTERVAL_MS = 60_000;

/**
 * The number on the "From chat" tab (`P19-T08`).
 *
 * Deliberately the list endpoint asked for one row rather than a count
 * endpoint of its own: `meta.total` is computed over the same filter the
 * table uses, so the badge can never say five while the table shows four, and
 * a single-row page is cheap enough to poll. It shares the list's query-key
 * prefix, so resolving a row from either the table or the arrival drawer
 * refreshes the badge with it.
 */
export function useAwaitingArrivalCount() {
  const params: ProspectivePatientControllerListProspectivePatientsV1Params = {
    status: 'AWAITING_ARRIVAL',
    limit: 1,
  };
  const query = useApiQuery<ProspectivePatientView[]>({
    queryKey: getProspectivePatientControllerListProspectivePatientsV1QueryKey(params),
    queryFn: (signal) => prospectivePatientControllerListProspectivePatientsV1(params, signal),
    errorMessage: 'Unable to count chat bookings.',
    options: { retry: false, refetchInterval: AWAITING_COUNT_POLL_INTERVAL_MS },
  });

  return { ...query, count: (query.meta as ProspectivePatientsListMeta | undefined)?.total ?? 0 };
}
