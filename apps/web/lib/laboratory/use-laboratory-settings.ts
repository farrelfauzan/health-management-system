import type { LaboratorySettingsView } from '@hms/shared-types';

import {
  getLaboratorySettingsControllerGetLaboratorySettingsV1QueryKey,
  laboratorySettingsControllerGetLaboratorySettingsV1,
} from '#lib/api/generated/laboratory-settings/laboratory-settings';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * How this clinic runs its bench (P18-T04): whether a technician may sign
 * out, and whether one person may enter and release. Read to *explain* a
 * disabled Rilis button, never to decide it — the API decides on the click.
 */
export function useLaboratorySettings(enabled = true) {
  const result = useApiQuery<LaboratorySettingsView>({
    queryKey: getLaboratorySettingsControllerGetLaboratorySettingsV1QueryKey(),
    queryFn: (signal) => laboratorySettingsControllerGetLaboratorySettingsV1(signal),
    errorMessage: 'Unable to load the laboratory settings.',
    enabled,
  });

  return { ...result, settings: result.data };
}
