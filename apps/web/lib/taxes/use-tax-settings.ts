import type { TaxSettingsView } from '@hms/shared-types';

import {
  getTaxSettingsControllerGetTaxSettingsV1QueryKey,
  taxSettingsControllerGetTaxSettingsV1,
} from '#lib/api/generated/tax-settings/tax-settings';
import { useApiQuery } from '#lib/api/use-api-query';

/** The clinic's tax profile (P27-T02), with the NPWP the clinic profile owns. */
export function useTaxSettings(enabled = true) {
  const result = useApiQuery<TaxSettingsView>({
    queryKey: getTaxSettingsControllerGetTaxSettingsV1QueryKey(),
    queryFn: (signal) => taxSettingsControllerGetTaxSettingsV1(signal),
    errorMessage: 'Unable to load the tax settings.',
    enabled,
  });

  return { ...result, settings: result.data };
}
