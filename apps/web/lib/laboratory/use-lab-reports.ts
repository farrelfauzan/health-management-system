import type { LabReportView } from '@hms/shared-types';

import {
  getLabReportControllerListReportsV1QueryKey,
  labReportControllerListReportsV1,
} from '#lib/api/generated/laboratory-orders/laboratory-orders';
import { useApiQuery } from '#lib/api/use-api-query';

const PENDING_POLL_INTERVAL_MS = 5_000;

/**
 * Every rendering of an order's report (P18-T05), polled while one is still
 * being rendered so the download button appears without a reload.
 */
export function useLabReports(labOrderId: string, enabled = true) {
  const result = useApiQuery<LabReportView>({
    queryKey: getLabReportControllerListReportsV1QueryKey(labOrderId),
    queryFn: (signal) => labReportControllerListReportsV1(labOrderId, signal),
    errorMessage: 'Unable to load the laboratory report.',
    enabled,
    options: {
      refetchInterval: (query) =>
        query.state.data?.data.versions.some((version) => version.status === 'PENDING')
          ? PENDING_POLL_INTERVAL_MS
          : false,
      refetchIntervalInBackground: false,
    },
  });

  return { ...result, report: result.data };
}
