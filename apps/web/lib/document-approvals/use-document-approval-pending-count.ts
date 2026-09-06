import type { DocumentApprovalPendingCountView } from '@hms/shared-types';

import {
  documentApprovalControllerGetPendingCountV1,
  getDocumentApprovalControllerGetPendingCountV1QueryKey,
} from '#lib/api/generated/documents/documents';
import { useApiQuery } from '#lib/api/use-api-query';

const POLL_INTERVAL_MS = 60_000;

/**
 * The sidebar badge (`P16-T31`, FR-E5-27).
 *
 * Takes its own `enabled` flag rather than being skipped by the caller,
 * because hooks cannot be conditional: every nav item calls
 * {@link useNavBadge}, and without the flag each one would open its own poll
 * for a count only the Documents entry displays.
 */
export function useDocumentApprovalPendingCount(enabled: boolean) {
  const query = useApiQuery<DocumentApprovalPendingCountView>({
    queryKey: getDocumentApprovalControllerGetPendingCountV1QueryKey(),
    queryFn: (signal) => documentApprovalControllerGetPendingCountV1(signal),
    errorMessage: 'Failed to load the approval count',
    enabled,
    options: { refetchInterval: POLL_INTERVAL_MS },
  });

  return { ...query, pending: query.data?.pending ?? 0, overdue: query.data?.overdue ?? 0 };
}
