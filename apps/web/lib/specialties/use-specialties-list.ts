import type { Specialty } from '@hms/shared-types';

import {
  getSpecialtyControllerListSpecialtiesV1QueryKey,
  specialtyControllerListSpecialtiesV1,
} from '#lib/api/generated/specialty/specialty';
import { useApiQuery } from '#lib/api/use-api-query';

export function useSpecialtiesList() {
  const query = useApiQuery<Specialty[]>({
    queryKey: getSpecialtyControllerListSpecialtiesV1QueryKey(),
    queryFn: (signal) => specialtyControllerListSpecialtiesV1(undefined, signal),
    errorMessage: 'Failed to load specialties',
  });

  return {
    ...query,
    specialties: query.data ?? [],
  };
}
