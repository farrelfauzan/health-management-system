import type { ClinicCorpusApprovalContextView } from '@hms/shared-types';

import {
  documentAdminControllerGetApprovalContextV1,
  getDocumentAdminControllerGetApprovalContextV1QueryKey,
} from '#lib/api/generated/document-management/document-management';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The corpus type's approval policy and its configured panel (`P19`).
 *
 * One read for the screen rather than one per row: all of it belongs to the
 * `CLINIC_CORPUS_DOCUMENT` type and not to any one document. It is what lets
 * the submit dialog open with the panel already filled in, so the common case
 * is a single click.
 */
export function useClinicCorpusApprovalContext(enabled = true) {
  const query = useApiQuery<ClinicCorpusApprovalContextView>({
    queryKey: getDocumentAdminControllerGetApprovalContextV1QueryKey(),
    queryFn: (signal) => documentAdminControllerGetApprovalContextV1(signal),
    errorMessage: 'Failed to load the corpus approval policy',
    enabled,
  });

  return { ...query, context: query.data };
}
