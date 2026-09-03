import type { VaultDocumentShareView } from '@hms/shared-types';

import {
  getVaultDocumentShareControllerListSharesV1QueryKey,
  vaultDocumentShareControllerListSharesV1,
} from '#lib/api/generated/document-management/document-management';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * Every key to one of the owner's own documents (`P16-T35`, FR-E3-16).
 *
 * Fetched only while the sharing panel is open: an owner looking at their
 * list of documents has not asked who each one is shared with, and issuing a
 * request per row would be a lot of traffic to answer a question nobody
 * asked.
 */
export function useDocumentShares(documentId: string, isEnabled: boolean) {
  const query = useApiQuery<VaultDocumentShareView[]>({
    queryKey: getVaultDocumentShareControllerListSharesV1QueryKey(documentId),
    queryFn: (signal) => vaultDocumentShareControllerListSharesV1(documentId, signal),
    errorMessage: 'Unable to load who this is shared with.',
    enabled: isEnabled && documentId !== '',
    options: { retry: false },
  });

  return { ...query, shares: query.data ?? [] };
}
