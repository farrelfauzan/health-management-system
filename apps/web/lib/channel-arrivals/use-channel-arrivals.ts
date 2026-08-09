import type { ChannelArrivalView } from '@hms/shared-types';

import {
  channelArrivalControllerListArrivalsV1,
  getChannelArrivalControllerListArrivalsV1QueryKey,
} from '#lib/api/generated/customer-service/customer-service';
import type { ChannelArrivalControllerListArrivalsV1Params } from '#lib/api/generated/model/channelArrivalControllerListArrivalsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * How often the check-in desk re-reads its worklist.
 *
 * Slower than the conversation inbox: a booking that appears here was made
 * minutes to days ago, and the row only changes when a customer books or a
 * colleague completes a profile. A minute is fast enough for a counter and
 * quiet enough for a screen that is open all day.
 */
const ARRIVAL_POLL_INTERVAL_MS = 60_000;

/**
 * Today's channel-sourced bookings.
 *
 * The window is left to the API, which resolves "today" in `CLINIC_TIMEZONE`.
 * Computing it here from the browser's clock would give a desk in Jakarta a
 * UTC day and lose its first seven hours of arrivals every morning.
 */
export function useChannelArrivals(params: ChannelArrivalControllerListArrivalsV1Params) {
  const query = useApiQuery<ChannelArrivalView[]>({
    queryKey: getChannelArrivalControllerListArrivalsV1QueryKey(params),
    queryFn: (signal) => channelArrivalControllerListArrivalsV1(params, signal),
    errorMessage: 'Unable to load channel bookings.',
    options: { retry: false, refetchInterval: ARRIVAL_POLL_INTERVAL_MS },
  });

  return { ...query, arrivals: query.data ?? [] };
}
