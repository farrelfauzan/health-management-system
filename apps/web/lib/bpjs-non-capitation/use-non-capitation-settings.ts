import type { NonCapitationSettingsView } from '@hms/shared-types';

import {
  bpjsNonCapitationSettingsControllerGetSettingsV1,
  getBpjsNonCapitationSettingsControllerGetSettingsV1QueryKey,
} from '#lib/api/generated/bpjs-non-capitation/bpjs-non-capitation';
import { useApiQuery } from '#lib/api/use-api-query';

/** The induk FKTP settings (P25-T16, D-043). */
export function useNonCapitationSettings() {
  return useApiQuery<NonCapitationSettingsView>({
    queryKey: getBpjsNonCapitationSettingsControllerGetSettingsV1QueryKey(),
    queryFn: (signal) => bpjsNonCapitationSettingsControllerGetSettingsV1(signal),
    errorMessage: 'Unable to load the induk settings.',
  });
}
