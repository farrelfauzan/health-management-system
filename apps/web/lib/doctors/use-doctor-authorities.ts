import type { DoctorAuthority } from '@hms/shared-types';

import {
  doctorAuthorityControllerListAuthoritiesV1,
  getDoctorAuthorityControllerListAuthoritiesV1QueryKey,
} from '#lib/api/generated/doctor-authorities/doctor-authorities';
import { useApiQuery } from '#lib/api/use-api-query';

/** A clinician's delegated authorities (P25-T02). Disabled until the card may render. */
export function useDoctorAuthorities(doctorId: string, isEnabled: boolean) {
  const query = useApiQuery<DoctorAuthority[]>({
    queryKey: getDoctorAuthorityControllerListAuthoritiesV1QueryKey(doctorId),
    queryFn: (signal) => doctorAuthorityControllerListAuthoritiesV1(doctorId, signal),
    errorMessage: 'Failed to load authorities',
    enabled: isEnabled && doctorId.length > 0,
  });
  return {
    ...query,
    authorities: query.data ?? [],
  };
}
