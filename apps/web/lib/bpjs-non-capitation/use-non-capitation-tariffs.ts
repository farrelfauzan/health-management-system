import type { NonCapitationTariffView } from '@hms/shared-types';

import {
  bpjsNonCapitationSettingsControllerListTariffsV1,
  getBpjsNonCapitationSettingsControllerListTariffsV1QueryKey,
} from '#lib/api/generated/bpjs-non-capitation/bpjs-non-capitation';
import { useApiQuery } from '#lib/api/use-api-query';

/** Every non-capitation tariff row (P25-T16). */
export function useNonCapitationTariffs() {
  return useApiQuery<NonCapitationTariffView[]>({
    queryKey: getBpjsNonCapitationSettingsControllerListTariffsV1QueryKey(),
    queryFn: (signal) => bpjsNonCapitationSettingsControllerListTariffsV1(signal),
    errorMessage: 'Unable to load the non-capitation tariffs.',
  });
}
