import type { SharedWithMeDocumentView } from '@hms/shared-types';

import {
  getSharedWithMeDocumentControllerListSharedWithMeV1QueryKey,
  sharedWithMeDocumentControllerListSharedWithMeV1,
} from '#lib/api/generated/document-management/document-management';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The documents other people have handed to this person (`P16-T35`,
 * FR-E3-17).
 *
 * Not a view onto anyone's vault — it is the set of individual documents
 * shared with the viewer, and it shows nothing about what else those vaults
 * hold. An empty list is a normal state, not an error.
 */
export function useSharedWithMe() {
  const query = useApiQuery<SharedWithMeDocumentView[]>({
    queryKey: getSharedWithMeDocumentControllerListSharedWithMeV1QueryKey(),
    queryFn: (signal) => sharedWithMeDocumentControllerListSharedWithMeV1(undefined, signal),
    errorMessage: 'Unable to load documents shared with you.',
    options: { retry: false },
  });

  return { ...query, documents: query.data ?? [] };
}
