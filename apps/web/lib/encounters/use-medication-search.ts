import type { MedicationResponse } from '@hms/shared-types';

import type { MedicationControllerListMedicationsV1Params } from '#lib/api/generated/model/medicationControllerListMedicationsV1Params';
import {
  getMedicationControllerListMedicationsV1QueryKey,
  medicationControllerListMedicationsV1,
} from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import { useApiQuery } from '#lib/api/use-api-query';
import { CODE_SEARCH_LIMIT, MIN_CODE_SEARCH_LENGTH } from '#lib/encounters/code-search-config';
import type { CodeSearchOption } from '#lib/encounters/code-search-option';

function toMedicationSearchOption(medication: MedicationResponse): CodeSearchOption {
  const detail = [medication.strength, medication.form].filter(Boolean).join(' ');
  return {
    id: medication.id,
    code: medication.code,
    display: detail ? `${medication.name} (${detail})` : medication.name,
  };
}

export function useMedicationSearch(search: string) {
  const trimmed = search.trim();
  const isEnabled = trimmed.length >= MIN_CODE_SEARCH_LENGTH;
  const requestParams: MedicationControllerListMedicationsV1Params = {
    search: trimmed,
    page: 1,
    limit: CODE_SEARCH_LIMIT,
  };
  const query = useApiQuery<MedicationResponse[]>({
    queryKey: getMedicationControllerListMedicationsV1QueryKey(requestParams),
    queryFn: (signal) => medicationControllerListMedicationsV1(requestParams, signal),
    errorMessage: 'Failed to search medications',
    enabled: isEnabled,
  });
  return {
    ...query,
    options: (query.data ?? []).map(toMedicationSearchOption),
    isEnabled,
  };
}
