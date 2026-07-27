import type { RegistrationListItem, RegistrationsListMeta } from '@hms/shared-types';

import {
  getRegistrationFlowControllerListRegistrationsV1QueryKey,
  registrationFlowControllerListRegistrationsV1,
} from '#lib/api/generated/registration-flow/registration-flow';
import type { RegistrationFlowControllerListRegistrationsV1Params } from '#lib/api/generated/model/registrationFlowControllerListRegistrationsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';
import type { RegistrationsSearchParams } from '#lib/registrations/search-params';

export function useRegistrationsList(params: RegistrationsSearchParams) {
  const requestParams: RegistrationFlowControllerListRegistrationsV1Params = {
    page: params.page,
    limit: params.limit,
    search: params.search,
    status: params.status,
    doctorId: params.doctorId,
    registeredFrom: params.registeredFrom,
    registeredTo: params.registeredTo,
  };

  const query = useApiQuery<RegistrationListItem[]>({
    queryKey: getRegistrationFlowControllerListRegistrationsV1QueryKey(requestParams),
    queryFn: (signal) => registrationFlowControllerListRegistrationsV1(requestParams, signal),
    errorMessage: 'Failed to load registrations',
  });

  return {
    ...query,
    registrations: query.data ?? [],
    meta: query.meta as RegistrationsListMeta | undefined,
  };
}
