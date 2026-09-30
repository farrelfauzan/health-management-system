import type { AnalyticsExportDashboardValue } from '@hms/shared-types';

import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { orvalAxiosMutator } from '#lib/api/http';
import { saveBlobFile } from '#lib/shared/save-blob-file';

type DownloadAnalyticsExportParams = {
  dashboard: AnalyticsExportDashboardValue;
  filter: AnalyticsFilterState;
  tableKeys: readonly string[];
};

/**
 * Downloads a dashboard's CSV (P29-T10) for the filter on screen. Through the
 * axios mutator as a blob, like the other file exports: the generated client
 * is typed for JSON, and reading the file as text would drop the BOM Excel
 * needs. The API records the export.
 */
export async function downloadAnalyticsExport({
  dashboard,
  filter,
  tableKeys,
}: DownloadAnalyticsExportParams): Promise<void> {
  const response = await orvalAxiosMutator<Blob>({
    url: `/api/v1/analytics/${dashboard}/export`,
    method: 'GET',
    params: {
      from: filter.from,
      to: filter.to,
      specialtyId: filter.specialtyId,
      doctorId: filter.doctorId,
      payerType: filter.payerType,
      tables: tableKeys.join(','),
    },
    responseType: 'blob',
  });
  saveBlobFile({
    blob: response.data,
    fileName: `metaklinik-${dashboard}-${filter.from}-${filter.to}.csv`,
  });
}
