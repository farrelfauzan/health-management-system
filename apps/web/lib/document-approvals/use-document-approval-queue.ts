import type { DocumentApprovalQueueView } from '@hms/shared-types';

import {
  documentApprovalControllerListApprovalsV1,
  getDocumentApprovalControllerListApprovalsV1QueryKey,
} from '#lib/api/generated/documents/documents';
import type { DocumentApprovalControllerListApprovalsV1Params } from '#lib/api/generated/model/documentApprovalControllerListApprovalsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The approval queue (`P16-T31`, US-E5-02). `assignedToMe` defaults to true
 * on the API, so a caller that forgets it gets their own work rather than
 * the whole clinic's — the queue is a personal list.
 */
export function useDocumentApprovalQueue(
  params: DocumentApprovalControllerListApprovalsV1Params,
  enabled = true,
) {
  const query = useApiQuery<DocumentApprovalQueueView>({
    queryKey: getDocumentApprovalControllerListApprovalsV1QueryKey(params),
    queryFn: (signal) => documentApprovalControllerListApprovalsV1(params, signal),
    errorMessage: 'Failed to load approvals',
    enabled,
  });

  return {
    ...query,
    approvals: query.data?.items ?? [],
    total: query.data?.meta.total ?? 0,
  };
}
