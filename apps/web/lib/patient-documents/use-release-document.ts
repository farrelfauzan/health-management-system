import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PatientDocumentView } from '@hms/shared-types';

import { patientDocumentDetailControllerReleaseDocumentV1 } from '#lib/api/generated/document-management/document-management';
import { parseApiSuccess } from '#lib/api/response';
import { invalidatePatientDocumentQueries } from '#lib/patient-documents/invalidate-patient-document-queries';

type UseReleaseDocumentParams = {
  patientId: string;
  errorMessage: string;
  onError: (message: string) => void;
  onSuccess: () => void;
};

/**
 * Releases one clinical file to the patient portal (FR-E2-13).
 *
 * Built with `useMutation` around the generated *function* rather than the
 * generated hook: the endpoint is a POST with no request body, so Orval emits
 * it as a `useQuery` with a query key. That is still generated code — the rule
 * is no hand-written HTTP, not no hand-written hooks — but a release is not a
 * read, and a query would retry it, refetch it on focus, and cache it.
 *
 * Every document list for the patient is invalidated on success rather than
 * the row being patched in place: the encounter panel and the patient tab both
 * show release state, and the portal list the patient sees is a third view of
 * the same fact.
 *
 * The endpoint is idempotent server-side, so a double click resolves twice and
 * is treated as one success — no error, and the caller decides whether to
 * announce it twice.
 */
export function useReleaseDocument(params: UseReleaseDocumentParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      parseApiSuccess<PatientDocumentView>(
        await patientDocumentDetailControllerReleaseDocumentV1(documentId),
        params.errorMessage,
      );
      await invalidatePatientDocumentQueries(queryClient, params.patientId);
    },
    onSuccess: params.onSuccess,
    onError: () => params.onError(params.errorMessage),
  });
}
