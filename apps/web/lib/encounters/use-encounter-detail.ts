import type { EncounterDetail } from '@hms/shared-types';

import {
  encounterControllerGetEncounterByIdV1,
  getEncounterControllerGetEncounterByIdV1QueryKey,
} from '#lib/api/generated/encounters/encounters';
import { useApiQuery } from '#lib/api/use-api-query';

export function useEncounterDetail(encounterId: string) {
  const query = useApiQuery<EncounterDetail>({
    queryKey: getEncounterControllerGetEncounterByIdV1QueryKey(encounterId),
    queryFn: (signal) => encounterControllerGetEncounterByIdV1(encounterId, signal),
    errorMessage: 'Failed to load the encounter',
  });

  return {
    ...query,
    encounter: query.data,
  };
}
