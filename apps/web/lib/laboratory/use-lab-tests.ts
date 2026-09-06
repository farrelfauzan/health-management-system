import type { LabTestView } from '@hms/shared-types';

import {
  getLabTestControllerListLabTestsV1QueryKey,
  labTestControllerListLabTestsV1,
} from '#lib/api/generated/laboratory-catalog/laboratory-catalog';
import { useApiQuery } from '#lib/api/use-api-query';

export function useLabTests(search: string) {
  const params = search.trim() ? { search: search.trim() } : {};
  const query = useApiQuery<LabTestView[]>({
    queryKey: getLabTestControllerListLabTestsV1QueryKey(params),
    queryFn: (signal) => labTestControllerListLabTestsV1(params, signal),
    errorMessage: 'Unable to load the laboratory catalog.',
  });
  return { ...query, labTests: query.data ?? [] };
}
