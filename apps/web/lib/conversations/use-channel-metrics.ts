import type { ChannelMetricsView } from '@hms/shared-types';

import {
  csAdminControllerGetMetricsV1,
  getCsAdminControllerGetMetricsV1QueryKey,
} from '#lib/api/generated/customer-service/customer-service';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * §8.4's channel metrics over the rollout window.
 *
 * Fourteen days, matching the API's default, because that is the window the
 * `PCS-T11` go/no-go checklist asks about — "two clean weeks on Telegram" is
 * the condition for announcing a WhatsApp number, not a figure of speech.
 *
 * Unlike the inbox and the transcript this does **not** poll. These are
 * fortnight aggregates: they do not meaningfully change between two glances,
 * and a screen that recomputed six counts every ten seconds would spend more
 * database time on the dashboard than on the conversations it describes.
 */
export function useChannelMetrics(days: number) {
  const params = { days };
  const query = useApiQuery<ChannelMetricsView>({
    queryKey: getCsAdminControllerGetMetricsV1QueryKey(params),
    queryFn: (signal) => csAdminControllerGetMetricsV1(params, signal),
    errorMessage: 'Unable to load channel metrics.',
    options: { retry: false },
  });

  return { ...query, metrics: query.data };
}
