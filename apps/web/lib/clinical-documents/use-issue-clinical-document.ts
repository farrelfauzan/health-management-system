'use client';

import { useMutation } from '@tanstack/react-query';
import { toast, useAbility } from '@hms/ui';

import { notifyApiError } from '#lib/api/notify-api-error';
import { openIssuedClinicalDocument } from '#lib/clinical-documents/open-issued-clinical-document';

type UseIssueClinicalDocumentParams<TVariables> = {
  /** Calls the letter's generated issue route and returns its raw response. */
  issue: (variables: TVariables) => Promise<{ status: number; data: unknown }>;
  readFromEncounterId?: string;
  successMessage: string;
  issueErrorMessage: string;
  openErrorMessage: string;
  /** Runs after a successful issue, before the PDF opens — e.g. query invalidation. */
  onIssued?: () => Promise<void>;
};

type UseIssueClinicalDocumentResult<TVariables> = {
  issueDocument: (variables: TVariables) => void;
  isIssuing: boolean;
};

/**
 * Issue a clinical letter, then open it.
 *
 * The toast confirms the letter exists; the PDF opening is what the clinician
 * actually wanted, because the paper is what the patient leaves with. Opening
 * needs `PatientDocument` read, which the issue routes do not: a caller who
 * may issue but not read the file keeps the toast and finds the letter in the
 * patient's documents, rather than being shown an error about a file they
 * were never going to see.
 */
export function useIssueClinicalDocument<TVariables = void>(
  params: UseIssueClinicalDocumentParams<TVariables>,
): UseIssueClinicalDocumentResult<TVariables> {
  const ability = useAbility();
  const canOpenDocument = ability.can('read', 'PatientDocument');
  const mutation = useMutation({
    mutationFn: params.issue,
    onSuccess: async (response) => {
      await params.onIssued?.();
      toast.success(params.successMessage);
      if (!canOpenDocument) {
        return;
      }
      await openIssuedClinicalDocument({
        response,
        readFromEncounterId: params.readFromEncounterId,
        issueErrorMessage: params.issueErrorMessage,
        openErrorMessage: params.openErrorMessage,
      }).catch((error: unknown) => notifyApiError(error, params.openErrorMessage));
    },
    onError: (error) => notifyApiError(error, params.issueErrorMessage),
  });
  return {
    issueDocument: (variables: TVariables) => mutation.mutate(variables),
    isIssuing: mutation.isPending,
  };
}
