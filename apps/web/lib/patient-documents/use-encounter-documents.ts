import { useQuery } from '@tanstack/react-query';
import type { ApiSuccess, EncounterDocumentsView } from '@hms/shared-types';

import {
  encounterDocumentControllerListEncounterDocumentsV1,
  getEncounterDocumentControllerListEncounterDocumentsV1QueryKey,
} from '#lib/api/generated/document-management/document-management';
import { parseApiSuccess } from '#lib/api/response';

const LOAD_ERROR_MESSAGE = 'Unable to load the documents for this encounter.';

/**
 * The encounter workspace's Documents panel (FR-E2-05).
 *
 * The visit split is **server-derived**: the API returns `thisVisit` and
 * `history` already separated, and this hook does not re-derive it. A client
 * that decided for itself which documents belonged to the visit would be a
 * second implementation of that rule, free to disagree with the first.
 *
 * `staleTime: 0` and a refetch on focus are deliberate, not defaults left
 * alone. A doctor's access here is an assignment or an attended encounter, and
 * either can be revoked mid-session (§7.2.7); serving this panel from cache
 * after that would show rows the API would now refuse. `retry: false` is the
 * same concern from the other side — a 403 is an answer, not a flake, and
 * retrying it three times only delays telling the reader.
 */
export function useEncounterDocuments(encounterId: string, isEnabled = true) {
  return useQuery<ApiSuccess<EncounterDocumentsView>, Error>({
    queryKey: getEncounterDocumentControllerListEncounterDocumentsV1QueryKey(encounterId),
    queryFn: async ({ signal }) =>
      parseApiSuccess<EncounterDocumentsView>(
        await encounterDocumentControllerListEncounterDocumentsV1(encounterId, signal),
        LOAD_ERROR_MESSAGE,
      ),
    enabled: isEnabled && encounterId.length > 0,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
