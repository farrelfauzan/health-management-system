import type { DocumentTypeView } from '@hms/shared-types';

import {
  documentTypeControllerListTypesV1,
  getDocumentTypeControllerListTypesV1QueryKey,
} from '#lib/api/generated/document-types/document-types';
import type { DocumentTypeControllerListTypesV1Params } from '#lib/api/generated/model/documentTypeControllerListTypesV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The type list (`P16-T39`). Live types only by default — what the
 * new-document picker wants — and every row for the settings screen.
 */
export function useDocumentTypes(includeInactive = false, isEnabled = true) {
  const params: DocumentTypeControllerListTypesV1Params = includeInactive
    ? { includeInactive: 'true' }
    : {};
  const query = useApiQuery<DocumentTypeView[]>({
    queryKey: getDocumentTypeControllerListTypesV1QueryKey(params),
    queryFn: (signal) => documentTypeControllerListTypesV1(params, signal),
    errorMessage: 'Failed to load document types',
    enabled: isEnabled,
  });

  return {
    ...query,
    types: query.data ?? [],
  };
}
