import type { ServiceTariffResponse, ServiceTariffsListMeta } from '@hms/shared-types';

import {
  getServiceTariffControllerListServiceTariffsV1QueryKey,
  serviceTariffControllerListServiceTariffsV1,
} from '#lib/api/generated/service-tariffs/service-tariffs';
import type { ServiceTariffControllerListServiceTariffsV1Params } from '#lib/api/generated/model/serviceTariffControllerListServiceTariffsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

export function useServiceTariffsList(
  params: ServiceTariffControllerListServiceTariffsV1Params,
  isEnabled = true,
) {
  const query = useApiQuery<ServiceTariffResponse[]>({
    queryKey: getServiceTariffControllerListServiceTariffsV1QueryKey(params),
    queryFn: (signal) => serviceTariffControllerListServiceTariffsV1(params, signal),
    errorMessage: 'Failed to load service tariffs',
    enabled: isEnabled,
  });

  return {
    ...query,
    tariffs: query.data ?? [],
    meta: query.meta as ServiceTariffsListMeta | undefined,
  };
}
