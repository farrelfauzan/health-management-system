import type { AnalyticsExportDashboardSpec, AnalyticsExportRunner } from '@hms/shared-types';

/**
 * Wraps a dashboard's export spec so the registry can hold every dashboard
 * side by side whatever its data type: reads the dashboard once and builds
 * only the tables asked for, in the order the page shows them.
 */
export function toAnalyticsExportRunner<TData>(
  spec: AnalyticsExportDashboardSpec<TData>,
): AnalyticsExportRunner {
  return {
    title: spec.title,
    tableKeys: spec.tables.map((table) => table.key),
    run: async (filter, tableKeys) => {
      const response = await spec.load(filter);
      const tables = spec.tables
        .filter((table) => tableKeys.includes(table.key))
        .map((table) => ({ key: table.key, title: table.title, ...table.build(response.data) }));
      return { meta: response.meta, tables };
    },
  };
}
