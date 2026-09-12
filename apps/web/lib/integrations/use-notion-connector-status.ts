import type { NotionConnectorStatusView } from '@hms/shared-types';

import {
  getNotionConnectorControllerGetStatusV1QueryKey,
  notionConnectorControllerGetStatusV1,
} from '#lib/api/generated/notion-connector/notion-connector';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The connector's status, read once per visit rather than polled.
 *
 * Nothing here changes on its own: the configuration is environment-only, so
 * it moves on a deploy and not otherwise, and the breaker state only matters
 * next to a test the operator just ran. Polling would spend a request a minute
 * to watch a value that is stable for weeks.
 */
export function useNotionConnectorStatus() {
  const query = useApiQuery<NotionConnectorStatusView>({
    queryKey: getNotionConnectorControllerGetStatusV1QueryKey(),
    queryFn: (signal) => notionConnectorControllerGetStatusV1(signal),
    errorMessage: 'Unable to read the Notion connector status.',
    options: { retry: false },
  });

  return { ...query, status: query.data };
}
