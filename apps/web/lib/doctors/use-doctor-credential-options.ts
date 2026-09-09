import type { DoctorCredentialKindValue, DoctorCredentialOption } from '@hms/shared-types';

import {
  doctorCredentialOptionControllerListDoctorCredentialOptionsV1,
  getDoctorCredentialOptionControllerListDoctorCredentialOptionsV1QueryKey,
} from '#lib/api/generated/doctor-credential-options/doctor-credential-options';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * Master data that changes a handful of times a year, read on every doctor
 * form and on the master-data screen. Held for an hour so opening the form
 * five times does not refetch the same catalog five times.
 */
const CREDENTIAL_OPTIONS_STALE_TIME_MS = 60 * 60 * 1000;

export function useDoctorCredentialOptions(params: {
  kind?: DoctorCredentialKindValue;
  includeInactive?: boolean;
}) {
  const requestParams = {
    ...(params.kind ? { kind: params.kind } : {}),
    ...(params.includeInactive ? { includeInactive: 'true' as const } : {}),
  };
  const query = useApiQuery<DoctorCredentialOption[]>({
    queryKey:
      getDoctorCredentialOptionControllerListDoctorCredentialOptionsV1QueryKey(requestParams),
    queryFn: (signal) =>
      doctorCredentialOptionControllerListDoctorCredentialOptionsV1(requestParams, signal),
    errorMessage: 'Unable to load the doctor credential catalog.',
    options: { staleTime: CREDENTIAL_OPTIONS_STALE_TIME_MS },
  });

  return {
    ...query,
    options: query.data ?? [],
  };
}
