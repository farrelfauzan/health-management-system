'use client';

import { useState } from 'react';
import type { AnalyticsExportDashboardValue } from '@hms/shared-types';
import { Button, Can, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AnalyticsExportDialog } from '#components/client/analytics/analytics-export-dialog';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';

type AnalyticsExportButtonProps = {
  dashboard: AnalyticsExportDashboardValue;
  dashboardTitle: string;
  filter: AnalyticsFilterState;
  /** Off while the filter is not a valid range, so nothing is exported for it. */
  isDisabled?: boolean;
};

/**
 * "Ekspor CSV" in a dashboard's header (P29-T10), shown only to someone who
 * holds `analytics.export`. The page's own read key is already theirs, or
 * they would not be on it.
 */
export function AnalyticsExportButton({
  dashboard,
  dashboardTitle,
  filter,
  isDisabled = false,
}: AnalyticsExportButtonProps) {
  const t = useTranslations('analytics.export');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  return (
    <Can action="export" subject="Analytics">
      <Button type="button" variant="outline" disabled={isDisabled} onClick={() => setIsOpen(true)}>
        <Icon name="download" size={18} />
        {t('button')}
      </Button>
      {isOpen ? (
        <AnalyticsExportDialog
          open={isOpen}
          onOpenChange={setIsOpen}
          dashboard={dashboard}
          dashboardTitle={dashboardTitle}
          filter={filter}
        />
      ) : null}
    </Can>
  );
}
