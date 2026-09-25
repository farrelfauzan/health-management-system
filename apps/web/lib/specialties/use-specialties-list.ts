import type { Specialty } from '@hms/shared-types';

import {
  getSpecialtyControllerListSpecialtiesV1QueryKey,
  specialtyControllerListSpecialtiesV1,
} from '#lib/api/generated/specialty/specialty';
import { useApiQuery } from '#lib/api/use-api-query';

type UseSpecialtiesListOptions = {
  /**
   * Pickers ask for active poli only, so a poli the clinic deactivated stops
   * being offered. Filters and the management screen read them all.
   */
  activeOnly?: boolean;
};

export function useSpecialtiesList({ activeOnly = false }: UseSpecialtiesListOptions = {}) {
  const params = activeOnly ? { isActive: 'true' as const } : undefined;
  const query = useApiQuery<Specialty[]>({
    queryKey: getSpecialtyControllerListSpecialtiesV1QueryKey(params),
    queryFn: (signal) => specialtyControllerListSpecialtiesV1(params, signal),
    errorMessage: 'Failed to load specialties',
  });

  return {
    ...query,
    specialties: query.data ?? [],
  };
}
