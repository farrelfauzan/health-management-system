import type { Icd10Code } from '@hms/shared-types';

import {
  getIcd10CodeControllerSearchIcd10CodesV1QueryKey,
  icd10CodeControllerSearchIcd10CodesV1,
} from '#lib/api/generated/terminology/terminology';
import type { Icd10CodeControllerSearchIcd10CodesV1Params } from '#lib/api/generated/model/icd10CodeControllerSearchIcd10CodesV1Params';
import { useApiQuery } from '#lib/api/use-api-query';
import { CODE_SEARCH_LIMIT, MIN_CODE_SEARCH_LENGTH } from '#lib/encounters/code-search-config';

export function useIcd10Search(search: string) {
  const trimmed = search.trim();
  const isEnabled = trimmed.length >= MIN_CODE_SEARCH_LENGTH;
  const requestParams: Icd10CodeControllerSearchIcd10CodesV1Params = {
    search: trimmed,
    limit: CODE_SEARCH_LIMIT,
    isActive: 'true',
  };

  const query = useApiQuery<Icd10Code[]>({
    queryKey: getIcd10CodeControllerSearchIcd10CodesV1QueryKey(requestParams),
    queryFn: (signal) => icd10CodeControllerSearchIcd10CodesV1(requestParams, signal),
    errorMessage: 'Failed to search ICD-10 codes',
    enabled: isEnabled,
  });

  return {
    ...query,
    codes: query.data ?? [],
    isEnabled,
  };
}
