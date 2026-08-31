import type { ProspectiveMatchCandidateView } from '@hms/shared-types';

import {
  getProspectivePatientControllerListMatchCandidatesV1QueryKey,
  prospectivePatientControllerListMatchCandidatesV1,
} from '#lib/api/generated/customer-service/customer-service';
import { useApiQuery } from '#lib/api/use-api-query';

/** Below this the search matches too much to be a search, and the API refuses it. */
const MIN_SEARCH_LENGTH = 2;

/** An Indonesian NIK is exactly sixteen digits; the API refuses anything else. */
const NIK_LENGTH = 16;

type UseProspectiveMatchCandidatesParams = {
  prospectivePatientId: string | null;
  search: string;
  nik: string;
  limit: number;
};

/**
 * Registry records the person at the counter might already be (`P17-T04`).
 *
 * **This query runs the moment the drawer opens, before anything is typed.**
 * That is the design, not an optimisation: the API seeds the search from the
 * booking's own name and phone number, and a search a clerk has to think of is
 * a search that gets skipped when the queue is six deep. Skipping it is what
 * produces a second permanent record for a patient the clinic already has.
 *
 * The typed fields are only sent once they could match something — a
 * half-typed NIK is not a NIK, and sending it would replace a useful default
 * search with a request the API rejects.
 */
export function useProspectiveMatchCandidates({
  prospectivePatientId,
  search,
  nik,
  limit,
}: UseProspectiveMatchCandidatesParams) {
  const trimmedSearch = search.trim();
  const nikDigits = nik.replace(/\D/g, '');
  const params = {
    ...(trimmedSearch.length >= MIN_SEARCH_LENGTH ? { search: trimmedSearch } : {}),
    ...(nikDigits.length === NIK_LENGTH ? { nik: nikDigits } : {}),
    limit,
  };
  const query = useApiQuery<ProspectiveMatchCandidateView[]>({
    queryKey: getProspectivePatientControllerListMatchCandidatesV1QueryKey(
      prospectivePatientId ?? '',
      params,
    ),
    queryFn: (signal) =>
      prospectivePatientControllerListMatchCandidatesV1(prospectivePatientId ?? '', params, signal),
    errorMessage: 'Unable to search patient records.',
    enabled: prospectivePatientId !== null,
    options: { retry: false },
  });

  return { ...query, candidates: query.data ?? [] };
}
