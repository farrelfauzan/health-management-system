import type { MedicationResponse } from '@hms/shared-types';

import {
  getMedicationControllerListMedicationsV1QueryKey,
  medicationControllerListMedicationsV1,
} from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import type { MedicationControllerListMedicationsV1Params } from '#lib/api/generated/model/medicationControllerListMedicationsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

const VACCINE_CATALOG_PARAMS: MedicationControllerListMedicationsV1Params = {
  page: 1,
  limit: 200,
};

/**
 * The vaccines a doctor can record an immunisation against (P10-T16).
 *
 * Filtered client-side because `isVaccine` is not a list parameter on the
 * medication endpoint: a klinik pratama's whole catalog is a few hundred rows,
 * and adding a query parameter to the pharmacy contract for one picker would
 * be a wider change than the picker deserves. Revisit if the catalog grows
 * past what one page can hold.
 */
export function useVaccineCatalog(enabled = true) {
  const query = useApiQuery<MedicationResponse[]>({
    queryKey: getMedicationControllerListMedicationsV1QueryKey(VACCINE_CATALOG_PARAMS),
    queryFn: (signal) => medicationControllerListMedicationsV1(VACCINE_CATALOG_PARAMS, signal),
    errorMessage: 'Failed to load the vaccine catalog',
    enabled,
  });

  return {
    ...query,
    vaccines: (query.data ?? []).filter((medication) => medication.isVaccine),
  };
}
