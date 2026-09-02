import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import type { ApiSuccess, PatientDocumentView } from '@hms/shared-types';

import {
  getPatientDocumentControllerListDocumentsV1QueryKey,
  patientDocumentControllerListDocumentsV1,
} from '#lib/api/generated/document-management/document-management';
import { parseApiSuccess } from '#lib/api/response';
import { buildPatientDocumentsListParams } from '#lib/patient-documents/build-patient-documents-list-params';
import type { PatientDocumentsFilters } from '#lib/patient-documents/patient-documents-filters';

type PatientDocumentsPage = ApiSuccess<PatientDocumentView[]>;

type PatientDocumentsQueryKey = ReturnType<
  typeof getPatientDocumentControllerListDocumentsV1QueryKey
>;

const LOAD_ERROR_MESSAGE = "Unable to load the patient's documents.";

function resolveNextCursor(page: PatientDocumentsPage): string | undefined {
  const nextCursor = page.meta?.nextCursor;
  return typeof nextCursor === 'string' && nextCursor.length > 0 ? nextCursor : undefined;
}

/**
 * One patient's clinical file, newest-first by document date (FR-E2-04).
 *
 * Cursor-paged rather than page-numbered because that is what the API
 * offers, and for a good reason: a clinician scrolling a long file while a
 * colleague uploads into it must not see a row twice or miss one, which is
 * exactly what an offset page does when the set shifts underneath it. The
 * pages are held by TanStack's infinite query and flattened here, so the
 * table only ever sees one list and a "load more" that either exists or does
 * not.
 *
 * The query key is the generated one for the *filtered* list, so every
 * filter combination is its own cache entry and switching back to an earlier
 * one is instant. Invalidation uses the unfiltered prefix and clears them all.
 */
export function usePatientDocuments(
  patientId: string,
  filters: PatientDocumentsFilters,
  isEnabled = true,
) {
  const params = buildPatientDocumentsListParams(filters);
  const query = useInfiniteQuery<
    PatientDocumentsPage,
    Error,
    InfiniteData<PatientDocumentsPage>,
    PatientDocumentsQueryKey,
    string | undefined
  >({
    queryKey: getPatientDocumentControllerListDocumentsV1QueryKey(patientId, params),
    initialPageParam: undefined,
    queryFn: async ({ pageParam, signal }) =>
      parseApiSuccess<PatientDocumentView[]>(
        await patientDocumentControllerListDocumentsV1(
          patientId,
          pageParam ? { ...params, cursor: pageParam } : params,
          signal,
        ),
        LOAD_ERROR_MESSAGE,
      ),
    getNextPageParam: resolveNextCursor,
    enabled: isEnabled && patientId.length > 0,
    retry: false,
  });
  return {
    ...query,
    documents: query.data?.pages.flatMap((page) => page.data) ?? [],
  };
}
