import type { Icd9cmCode } from '@hms/shared-types';

import {
  getIcd9cmCodeControllerSearchIcd9cmCodesV1QueryKey,
  icd9cmCodeControllerSearchIcd9cmCodesV1,
} from '#lib/api/generated/terminology/terminology';
import type { Icd9cmCodeControllerSearchIcd9cmCodesV1Params } from '#lib/api/generated/model/icd9cmCodeControllerSearchIcd9cmCodesV1Params';
import { useApiQuery } from '#lib/api/use-api-query';
import { CODE_SEARCH_LIMIT, MIN_CODE_SEARCH_LENGTH } from '#lib/encounters/code-search-config';

export function useIcd9cmSearch(search: string) {
  const trimmed = search.trim();
  const isEnabled = trimmed.length >= MIN_CODE_SEARCH_LENGTH;
  const requestParams: Icd9cmCodeControllerSearchIcd9cmCodesV1Params = {
    search: trimmed,
    limit: CODE_SEARCH_LIMIT,
    isActive: 'true',
  };

  const query = useApiQuery<Icd9cmCode[]>({
    queryKey: getIcd9cmCodeControllerSearchIcd9cmCodesV1QueryKey(requestParams),
    queryFn: (signal) => icd9cmCodeControllerSearchIcd9cmCodesV1(requestParams, signal),
    errorMessage: 'Failed to search ICD-9-CM codes',
    enabled: isEnabled,
  });

  return {
    ...query,
    codes: query.data ?? [],
    isEnabled,
  };
}
