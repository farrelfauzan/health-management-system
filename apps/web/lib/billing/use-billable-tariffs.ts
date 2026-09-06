import type { ServiceTariffResponse } from '@hms/shared-types';

import { useServiceTariffsList } from '#lib/billing/use-service-tariffs-list';

/** A picker needs the whole active price list, not a page of it. */
const BILLABLE_TARIFFS_PAGE_SIZE = 100;

/**
 * Every active tariff, for attaching one to a draft invoice by hand. The
 * list is the API's cap of one page — a clinic's price list is dozens of
 * rows, not thousands — and the combobox filters it client-side.
 */
export function useBillableTariffs(isEnabled: boolean): {
  tariffs: ServiceTariffResponse[];
  isPending: boolean;
} {
  const query = useServiceTariffsList(
    { page: 1, limit: BILLABLE_TARIFFS_PAGE_SIZE, isActive: 'true' },
    isEnabled,
  );

  return { tariffs: query.tariffs, isPending: query.isPending };
}
