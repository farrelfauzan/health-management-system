import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PatientDocumentReleaseView, ReleasePatientDocumentInput } from '@hms/shared-types';

import {
  getPatientDocumentDetailControllerListDeliveriesV1QueryKey,
  patientDocumentDetailControllerReleaseDocumentV1,
} from '#lib/api/generated/document-management/document-management';
import { parseApiSuccess } from '#lib/api/response';
import { invalidatePatientDocumentQueries } from '#lib/patient-documents/invalidate-patient-document-queries';

type ReleaseDocumentRequest = {
  documentId: string;
  input: ReleasePatientDocumentInput;
};

type UseReleaseDocumentParams = {
  patientId: string;
  errorMessage: string;
  onError: (message: string) => void;
  onSuccess: (result: PatientDocumentReleaseView) => void;
};

/**
 * Releases one clinical file to the patient portal (FR-E2-13), optionally
 * dispatching it to the patient in the same action (`P16-T40`, FR-E4-24).
 *
 * Built with `useMutation` around the generated *function* rather than the
 * generated hook: a release is not a read, and a query would retry it,
 * refetch it on focus, and cache it.
 *
 * Every document list for the patient is invalidated on success rather than
 * the row being patched in place: the encounter panel and the patient tab
 * both show release state, and the portal list the patient sees is a third
 * view of the same fact. The document's own delivery timeline is refreshed
 * too, so the Deliveries dialog shows the rows this release queued.
 *
 * The endpoint is idempotent server-side, so a double click resolves twice
 * and is treated as one success — no error, and the caller decides whether
 * to announce it twice.
 */
export function useReleaseDocument(params: UseReleaseDocumentParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, input }: ReleaseDocumentRequest) => {
      const envelope = parseApiSuccess<PatientDocumentReleaseView>(
        await patientDocumentDetailControllerReleaseDocumentV1(documentId, input),
        params.errorMessage,
      );
      await invalidatePatientDocumentQueries(queryClient, params.patientId);
      await queryClient.invalidateQueries({
        queryKey: getPatientDocumentDetailControllerListDeliveriesV1QueryKey(documentId),
      });
      return envelope.data;
    },
    onSuccess: params.onSuccess,
    onError: () => params.onError(params.errorMessage),
  });
}
