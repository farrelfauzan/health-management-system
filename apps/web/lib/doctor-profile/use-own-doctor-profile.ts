import type { DoctorDetail } from '@hms/shared-types';

import {
  doctorOwnProfileControllerGetOwnDoctorProfileV1,
  getDoctorOwnProfileControllerGetOwnDoctorProfileV1QueryKey,
} from '#lib/api/generated/doctor-management/doctor-management';
import { isApiStatusError } from '#lib/api/is-api-status-error';
import { useApiQuery } from '#lib/api/use-api-query';

const HTTP_NOT_FOUND_STATUS = 404;
const MAX_RETRIES = 2;

/**
 * The signed-in doctor's own profile (P20-T03).
 *
 * A 404 is an answer, not a failure: the account has no doctor profile linked
 * to it. It is surfaced as `hasNoProfile` and never retried, so the page can
 * say so at once instead of spinning through the default retries first.
 */
export function useOwnDoctorProfile() {
  const query = useApiQuery<DoctorDetail>({
    queryKey: getDoctorOwnProfileControllerGetOwnDoctorProfileV1QueryKey(),
    queryFn: (signal) => doctorOwnProfileControllerGetOwnDoctorProfileV1(signal),
    errorMessage: 'Failed to load your profile',
    options: {
      retry: (failureCount, error) =>
        !isApiStatusError(error, HTTP_NOT_FOUND_STATUS) && failureCount < MAX_RETRIES,
    },
  });

  return {
    ...query,
    doctor: query.data,
    hasNoProfile: isApiStatusError(query.error, HTTP_NOT_FOUND_STATUS),
  };
}
