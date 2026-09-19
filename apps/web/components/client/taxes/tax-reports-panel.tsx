'use client';

import { useState } from 'react';
import { TAX_REPORT_KINDS } from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Skeleton,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { TaxReportMonthCell } from '#components/client/taxes/tax-report-month-cell';
import { buildTaxReportPeriods } from '#lib/taxes/build-tax-report-periods';
import { useTaxReports } from '#lib/taxes/use-tax-reports';

type TaxReportsPanelProps = {
  /** The current year and month in the clinic timezone, from the server. */
  currentPeriod: string;
};

/**
 * A year of monthly tax report drafts (P27-T05): one row per report the tax
 * profile calls for, one cell per month. The product drafts; the clinic pays
 * and files in Coretax — the banner says so on every screen.
 */
export function TaxReportsPanel({ currentPeriod }: TaxReportsPanelProps) {
  const t = useTranslations('operations.taxes.reports');
  const ability = useAbility();
  const canWrite = ability.can('write', 'TaxReport');
  const [year, setYear] = useState<number>(Number(currentPeriod.slice(0, 4)));
  const { reports, meta, isPending, isError } = useTaxReports(year);
  const periods = buildTaxReportPeriods(year);
  const kinds = TAX_REPORT_KINDS.filter((kind) => meta?.applicableKinds.includes(kind));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t('previousYear')}
              onClick={() => setYear(year - 1)}
            >
              <Icon name="chevron_left" size={18} />
            </Button>
            <span className="min-w-12 text-center font-heading text-sm font-semibold">{year}</span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t('nextYear')}
              onClick={() => setYear(year + 1)}
            >
              <Icon name="chevron_right" size={18} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <InlineNotice tone="info">{t('draftBanner')}</InlineNotice>
        {isPending ? <Skeleton className="h-40 w-full" /> : null}
        {isError ? <InlineNotice tone="error">{t('loadError')}</InlineNotice> : null}
        {!isPending && !isError && kinds.length === 0 ? (
          <InlineNotice tone="warning">{t('notApplicable')}</InlineNotice>
        ) : null}
        {kinds.map((kind) => (
          <section key={kind} className="space-y-2">
            <h3 className="font-heading text-sm font-semibold text-slate-900">
              {t(`kind.${kind}`)}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {periods.map((period) => (
                <TaxReportMonthCell
                  key={period}
                  period={period}
                  kind={kind}
                  report={reports.find((item) => item.period === period && item.kind === kind)}
                  canWrite={canWrite}
                  isFuture={period > currentPeriod}
                />
              ))}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
