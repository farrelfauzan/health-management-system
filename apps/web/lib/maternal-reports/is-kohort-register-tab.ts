import type { KohortRegisterKindValue } from '@hms/shared-types';

import type { MaternalReportTab } from '#lib/maternal-reports/maternal-report-tabs';

/** The three tabs that take a village filter and answer a register. */
export function isKohortRegisterTab(tab: MaternalReportTab): tab is KohortRegisterKindValue {
  return tab === 'kohort-ibu' || tab === 'kohort-bayi' || tab === 'kohort-kb';
}
