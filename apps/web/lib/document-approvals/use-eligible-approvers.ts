import type { DocumentApproverCandidateView } from '@hms/shared-types';

import {
  getManagedDocumentControllerListEligibleApproversV1QueryKey,
  managedDocumentControllerListEligibleApproversV1,
} from '#lib/api/generated/documents/documents';
import { useApiQuery } from '#lib/api/use-api-query';

const ELIGIBLE_APPROVER_LIMIT = 50;

/**
 * Who may be named on an approval panel (`P19`).
 *
 * The API filters on `document-approval.decide:any` — the permission that
 * governs the decision — rather than on a role name, so the picker offers
 * exactly the accounts the submit endpoint will accept. Naming somebody who
 * cannot approve used to be allowed and produced a round nobody could
 * resolve: the drafter waited, the document stayed out of the assistant's
 * reach, and nothing ever said why.
 */
export function useEligibleApprovers(search: string) {
  const params = {
    limit: ELIGIBLE_APPROVER_LIMIT,
    ...(search === '' ? {} : { search }),
  };
  const query = useApiQuery<DocumentApproverCandidateView[]>({
    queryKey: getManagedDocumentControllerListEligibleApproversV1QueryKey(params),
    queryFn: (signal) => managedDocumentControllerListEligibleApproversV1(params, signal),
    errorMessage: 'Failed to load eligible approvers',
  });

  return { ...query, approvers: query.data ?? [] };
}
