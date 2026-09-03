import type { DoctorLicenseExpiryBucketsView } from '@hms/shared-types';

import {
  doctorLicenseExpiryControllerListExpiryBucketsV1,
  getDoctorLicenseExpiryControllerListExpiryBucketsV1QueryKey,
} from '#lib/api/generated/doctor-management/doctor-management';
import { useApiQuery } from '#lib/api/use-api-query';

const EMPTY_BUCKETS: DoctorLicenseExpiryBucketsView = {
  expired: [],
  within30Days: [],
  within60Days: [],
  within90Days: [],
};

/**
 * The clinic's licence expiry roster (P16-T19).
 *
 * `isEnabled` exists because the doctor directory calls this hook to flag its
 * own rows, and the directory is readable by roles that cannot read the
 * roster. Passing `false` there keeps a 403 out of the console for a user who
 * was never meant to see the data — the flag simply does not appear.
 */
export function useDoctorLicenseExpiry(isEnabled: boolean = true) {
  const query = useApiQuery<DoctorLicenseExpiryBucketsView>({
    queryKey: getDoctorLicenseExpiryControllerListExpiryBucketsV1QueryKey(),
    queryFn: (signal) => doctorLicenseExpiryControllerListExpiryBucketsV1(signal),
    errorMessage: 'Failed to load licence expiry',
    enabled: isEnabled,
  });

  return {
    ...query,
    buckets: query.data ?? EMPTY_BUCKETS,
  };
}
