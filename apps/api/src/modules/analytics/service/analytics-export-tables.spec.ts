import { ANALYTICS_EXPORT_TABLE_KEYS } from '@hms/shared-types';

import { CASE_MIX_EXPORT_TABLES } from './case-mix-export-tables';
import { FINANCE_EXPORT_TABLES } from './finance-export-tables';
import { OPERATIONS_EXPORT_TABLES } from './operations-export-tables';
import { REPORTING_EXPORT_TABLES } from './reporting-export-tables';

/** The web's checklist and the API's tables are one list; this keeps them so. */
describe('analytics export tables', () => {
  it.each([
    ['operations', OPERATIONS_EXPORT_TABLES],
    ['finance', FINANCE_EXPORT_TABLES],
    ['case-mix', CASE_MIX_EXPORT_TABLES],
    ['reporting', REPORTING_EXPORT_TABLES],
  ] as const)('registers exactly the %s tables the web offers, in order', (dashboard, tables) => {
    expect(tables.map((table) => table.key)).toEqual([...ANALYTICS_EXPORT_TABLE_KEYS[dashboard]]);
  });
});
