import type { ApiSuccess, ClinicDocumentView } from '@hms/shared-types';

import {
  documentAdminControllerListDocumentsV1,
  getDocumentAdminControllerListDocumentsV1QueryKey,
} from '#lib/api/generated/document-management/document-management';
import type { DocumentAdminControllerListDocumentsV1Params } from '#lib/api/generated/model/documentAdminControllerListDocumentsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';
import { resolveDocumentIngestState } from '#lib/documents/document-ingest-state';

/** How often to re-check while the worker is still embedding something. */
const INGEST_POLL_INTERVAL_MS = 5_000;

/**
 * The shared clinic corpus — the FAQ and SOP documents the in-app assistant
 * and, from `PCS-T05`, the WhatsApp/Telegram channel answer patients from.
 *
 * Separate from `usePersonalDocuments` rather than a mode of it. The two read
 * different routes with different permission scopes, and the difference is the
 * only thing about them that matters: this one reaches documents every patient
 * can be shown, and collapsing both into one hook with an owner argument would
 * put that distinction in a parameter instead of in a URL.
 *
 * **Polling is decided from the data**, as it is for the personal corpus:
 * `PENDING` and `PROCESSING` are states a background worker leaves without
 * telling the browser, so a list that never refetched would show an admin
 * "not answerable yet" for a document that finished a minute ago. Once every
 * row is settled the interval returns `false` and an idle tab goes quiet.
 */
export function useClinicDocuments(params: DocumentAdminControllerListDocumentsV1Params) {
  return useApiQuery<ClinicDocumentView[]>({
    queryKey: getDocumentAdminControllerListDocumentsV1QueryKey(params),
    queryFn: (signal) => documentAdminControllerListDocumentsV1(params, signal),
    errorMessage: 'Unable to load the clinic corpus.',
    options: {
      retry: false,
      refetchInterval: (query) => {
        const envelope = query.state.data as ApiSuccess<ClinicDocumentView[]> | undefined;
        const isAnyIngesting = (envelope?.data ?? []).some(
          (document) => !resolveDocumentIngestState(document.ingestStatus).isAnswerable,
        );
        return isAnyIngesting ? INGEST_POLL_INTERVAL_MS : false;
      },
    },
  });
}
