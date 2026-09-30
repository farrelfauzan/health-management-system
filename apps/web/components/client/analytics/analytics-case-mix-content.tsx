'use client';

import type { AnalyticsCaseMixData } from '@hms/shared-types';

import { AnalyticsCaseMixKpis } from '#components/client/analytics/analytics-case-mix-kpis';
import { AnalyticsCodingCompletenessCard } from '#components/client/analytics/analytics-coding-completeness-card';
import { AnalyticsIcdGroupsCard } from '#components/client/analytics/analytics-icd-groups-card';
import { AnalyticsTopDiagnosesCard } from '#components/client/analytics/analytics-top-diagnoses-card';
import { AnalyticsTopProceduresCard } from '#components/client/analytics/analytics-top-procedures-card';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';

type AnalyticsCaseMixContentProps = {
  caseMix: AnalyticsCaseMixData;
  filter: AnalyticsFilterState;
};

/** The case-mix figures, laid out as the Pola penyakit artboard. */
export function AnalyticsCaseMixContent({ caseMix, filter }: AnalyticsCaseMixContentProps) {
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsCaseMixKpis caseMix={caseMix} />
      <div className="flex flex-col gap-5 xl:flex-row">
        <AnalyticsTopDiagnosesCard diagnoses={caseMix.breakdowns.topDiagnoses} />
        <AnalyticsCodingCompletenessCard
          totals={caseMix.totals}
          codingByPoli={caseMix.breakdowns.codingByPoli}
          filter={filter}
        />
      </div>
      <div className="flex flex-col gap-5 xl:flex-row">
        <AnalyticsIcdGroupsCard groups={caseMix.breakdowns.groups} />
        <AnalyticsTopProceduresCard procedures={caseMix.breakdowns.topProcedures} />
      </div>
    </div>
  );
}
