import type { VaultDocumentView } from '@hms/shared-types';

import {
  getVaultDocumentControllerListDocumentsV1QueryKey,
  vaultDocumentControllerListDocumentsV1,
} from '#lib/api/generated/document-management/document-management';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The signed-in user's own document vault (`P16-T18`).
 *
 * There is no owner parameter, and nothing to pass one to: the API derives
 * the owner from the session, so this hook cannot be pointed at somebody
 * else's vault even by mistake.
 *
 * Unlike `usePersonalDocuments`, this one never polls. A knowledge-base
 * document changes state behind the browser's back while the ingestion worker
 * embeds it; a vault document is stored and served and has no pipeline to
 * wait on, so there is nothing a refetch could discover.
 */
export function useVaultDocuments() {
  return useApiQuery<VaultDocumentView[]>({
    queryKey: getVaultDocumentControllerListDocumentsV1QueryKey(),
    queryFn: (signal) => vaultDocumentControllerListDocumentsV1(undefined, signal),
    errorMessage: 'Unable to load your documents.',
    options: { retry: false },
  });
}
