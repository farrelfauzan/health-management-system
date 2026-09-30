'use client';

import type { AnalyticsLaboratoryData } from '@hms/shared-types';

import { AnalyticsLabOrderStatusCard } from '#components/client/analytics/analytics-lab-order-status-card';
import { AnalyticsLabTurnaroundCard } from '#components/client/analytics/analytics-lab-turnaround-card';
import { AnalyticsLaboratoryKpis } from '#components/client/analytics/analytics-laboratory-kpis';

type AnalyticsLaboratoryContentProps = {
  laboratory: AnalyticsLaboratoryData;
};

/** The laboratory figures, laid out as the Laboratorium artboard. */
export function AnalyticsLaboratoryContent({ laboratory }: AnalyticsLaboratoryContentProps) {
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsLaboratoryKpis laboratory={laboratory} />
      <div className="flex flex-col gap-5 xl:flex-row">
        <AnalyticsLabTurnaroundCard tests={laboratory.breakdowns.tests} />
        <AnalyticsLabOrderStatusCard laboratory={laboratory} />
      </div>
    </div>
  );
}
