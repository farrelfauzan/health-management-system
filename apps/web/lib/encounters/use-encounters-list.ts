import type { EncounterListItem, EncountersListMeta } from '@hms/shared-types';

import {
  encounterControllerListEncountersV1,
  getEncounterControllerListEncountersV1QueryKey,
} from '#lib/api/generated/encounters/encounters';
import type { EncounterControllerListEncountersV1Params } from '#lib/api/generated/model/encounterControllerListEncountersV1Params';
import { useApiQuery } from '#lib/api/use-api-query';
import type { EncountersSearchParams } from '#lib/encounters/search-params';

export function useEncountersList(params: EncountersSearchParams) {
  const requestParams: EncounterControllerListEncountersV1Params = {
    page: params.page,
    limit: params.limit,
    status: params.status,
    patientId: params.patientId,
    doctorId: params.doctorId,
    registrationId: params.registrationId,
    startedFrom: params.startedFrom,
    startedTo: params.startedTo,
  };

  const query = useApiQuery<EncounterListItem[]>({
    queryKey: getEncounterControllerListEncountersV1QueryKey(requestParams),
    queryFn: (signal) => encounterControllerListEncountersV1(requestParams, signal),
    errorMessage: 'Failed to load encounters',
  });

  return {
    ...query,
    encounters: query.data ?? [],
    meta: query.meta as EncountersListMeta | undefined,
  };
}
