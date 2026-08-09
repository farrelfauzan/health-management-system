import type { ChannelMergeCandidateView } from '@hms/shared-types';

import {
  channelArrivalControllerListMergeCandidatesV1,
  getChannelArrivalControllerListMergeCandidatesV1QueryKey,
} from '#lib/api/generated/customer-service/customer-service';
import { useApiQuery } from '#lib/api/use-api-query';

/** Below this the search matches too much to be a search, and the API refuses it. */
const MIN_SEARCH_LENGTH = 2;

/**
 * Records a chat-created draft could be merged into.
 *
 * Separate from `usePatientsList` and not a mode of it, matching the API: this
 * asks for *valid merge targets* — active, front-desk records only — and gets
 * back the MRN, phone number, and date of birth that the patient directory's
 * list projection does not carry and that a counter needs to confirm identity.
 *
 * Disabled rather than debounced below the minimum length. The dialog opens
 * pre-filled with the draft's phone number, so the common path is one request
 * for a search that was already typed, not a request per keystroke.
 */
export function useChannelMergeCandidates(search: string, limit: number) {
  const trimmed = search.trim();
  const isSearchable = trimmed.length >= MIN_SEARCH_LENGTH;
  const params = { search: trimmed, limit };
  const query = useApiQuery<ChannelMergeCandidateView[]>({
    queryKey: getChannelArrivalControllerListMergeCandidatesV1QueryKey(params),
    queryFn: (signal) => channelArrivalControllerListMergeCandidatesV1(params, signal),
    errorMessage: 'Unable to search patient records.',
    enabled: isSearchable,
    options: { retry: false },
  });

  return { ...query, candidates: query.data ?? [] };
}
