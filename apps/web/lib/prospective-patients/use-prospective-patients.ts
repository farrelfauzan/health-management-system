import type { ProspectivePatientsListMeta, ProspectivePatientView } from '@hms/shared-types';

import {
  getProspectivePatientControllerListProspectivePatientsV1QueryKey,
  prospectivePatientControllerListProspectivePatientsV1,
} from '#lib/api/generated/customer-service/customer-service';
import type { ProspectivePatientControllerListProspectivePatientsV1Params } from '#lib/api/generated/model/prospectivePatientControllerListProspectivePatientsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';
import {
  PROSPECTIVE_PATIENTS_PAGE_SIZE,
  type ProspectivePatientsFilters,
} from '#lib/prospective-patients/prospective-patients-filters';

/**
 * How often the "From chat" table re-reads itself while open.
 *
 * The same minute the arrival worklist uses: a row appears when a customer
 * books and changes when a colleague resolves it, and neither happens fast
 * enough to justify anything quicker on a tab that may sit open all day.
 */
const PROSPECTIVE_PATIENTS_POLL_INTERVAL_MS = 60_000;

/**
 * One page of people who booked through chat and are not patients yet
 * (`P19-T08`). The typed search is only sent once it holds something, so an
 * emptied box goes back to the plain filter instead of asking for `q=`.
 */
export function useProspectivePatients(filters: ProspectivePatientsFilters) {
  const search = filters.q.trim();
  const params: ProspectivePatientControllerListProspectivePatientsV1Params = {
    status: filters.status,
    channel: filters.channel,
    q: search.length === 0 ? undefined : search,
    sort: filters.sort,
    order: filters.order,
    page: filters.page,
    limit: PROSPECTIVE_PATIENTS_PAGE_SIZE,
  };
  const query = useApiQuery<ProspectivePatientView[]>({
    queryKey: getProspectivePatientControllerListProspectivePatientsV1QueryKey(params),
    queryFn: (signal) => prospectivePatientControllerListProspectivePatientsV1(params, signal),
    errorMessage: 'Unable to load chat bookings.',
    options: { retry: false, refetchInterval: PROSPECTIVE_PATIENTS_POLL_INTERVAL_MS },
  });

  return {
    ...query,
    items: query.data ?? [],
    meta: query.meta as ProspectivePatientsListMeta | undefined,
  };
}
