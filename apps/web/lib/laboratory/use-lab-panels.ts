import type { LabPanelView } from '@hms/shared-types';

import {
  getLabPanelControllerListLabPanelsV1QueryKey,
  labPanelControllerListLabPanelsV1,
} from '#lib/api/generated/laboratory-catalog/laboratory-catalog';
import { useApiQuery } from '#lib/api/use-api-query';

export function useLabPanels(search: string) {
  const params = search.trim() ? { search: search.trim() } : {};
  const query = useApiQuery<LabPanelView[]>({
    queryKey: getLabPanelControllerListLabPanelsV1QueryKey(params),
    queryFn: (signal) => labPanelControllerListLabPanelsV1(params, signal),
    errorMessage: 'Unable to load the laboratory panels.',
  });
  return { ...query, labPanels: query.data ?? [] };
}
