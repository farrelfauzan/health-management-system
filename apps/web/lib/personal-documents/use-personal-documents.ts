import type { ApiSuccess, PersonalDocumentView } from '@hms/shared-types';

import {
  getPersonalDocumentControllerListDocumentsV1QueryKey,
  personalDocumentControllerListDocumentsV1,
} from '#lib/api/generated/document-management/document-management';
import { useApiQuery } from '#lib/api/use-api-query';
import { resolvePersonalDocumentIngestState } from '#lib/personal-documents/personal-document-ingest-state';

/** How often to re-check while the worker is still embedding something. */
const INGEST_POLL_INTERVAL_MS = 5_000;

/**
 * The signed-in user's own knowledge base.
 *
 * There is no owner parameter, and nothing to pass one to: the API derives the
 * owner from the session, so this hook cannot be pointed at somebody else's
 * corpus even by mistake.
 *
 * **Polling is decided here rather than by the caller**, from the data itself.
 * `PENDING` and `PROCESSING` are states a background worker leaves without
 * telling the browser, so a list that never refetched would strand an owner on
 * "not answerable yet" for a document that finished a minute ago. Once every
 * row is settled the interval returns `false` and an idle tab goes quiet —
 * which is why this is a function of the cached data rather than a fixed
 * interval, and why the caller does not get to pass one in.
 */
export function usePersonalDocuments() {
  return useApiQuery<PersonalDocumentView[]>({
    queryKey: getPersonalDocumentControllerListDocumentsV1QueryKey(),
    queryFn: (signal) => personalDocumentControllerListDocumentsV1(undefined, signal),
    errorMessage: 'Unable to load your knowledge base.',
    options: {
      retry: false,
      refetchInterval: (query) => {
        const envelope = query.state.data as ApiSuccess<PersonalDocumentView[]> | undefined;
        const isAnyIngesting = (envelope?.data ?? []).some(
          (document) => !resolvePersonalDocumentIngestState(document.ingestStatus).isAnswerable,
        );
        return isAnyIngesting ? INGEST_POLL_INTERVAL_MS : false;
      },
    },
  });
}
