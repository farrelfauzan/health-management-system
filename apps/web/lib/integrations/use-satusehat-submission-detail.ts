import type { SatusehatSubmissionDetailView } from '@hms/shared-types';

import {
  getSatusehatSubmissionControllerGetSubmissionDetailV1QueryKey,
  satusehatSubmissionControllerGetSubmissionDetailV1,
} from '#lib/api/generated/satusehat/satusehat';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * One submission and what it sent (P21-T03).
 *
 * Fetched only while the drawer is open: it is detail for a row somebody chose,
 * and the list already tells them whether the submission succeeded.
 */
export function useSatusehatSubmissionDetail(submissionId: string | null) {
  const query = useApiQuery<SatusehatSubmissionDetailView>({
    queryKey: getSatusehatSubmissionControllerGetSubmissionDetailV1QueryKey(submissionId ?? ''),
    queryFn: (signal) =>
      satusehatSubmissionControllerGetSubmissionDetailV1(submissionId ?? '', signal),
    errorMessage: 'Unable to read the submission detail.',
    enabled: submissionId !== null,
    options: { retry: false },
  });

  return { ...query, detail: query.data };
}
