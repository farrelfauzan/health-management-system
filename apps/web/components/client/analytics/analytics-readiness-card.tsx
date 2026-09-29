'use client';

import type { AnalyticsReportingReadiness } from '@hms/shared-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';

type AnalyticsReadinessCardProps = {
  readiness: AnalyticsReportingReadiness;
};

/**
 * Finished visits SATUSEHAT cannot take yet. The missing-NIK row links to
 * the clinician directory filtered to exactly those clinicians; the
 * missing-diagnosis row has no list to link to, so it is a count.
 */
export function AnalyticsReadinessCard({ readiness }: AnalyticsReadinessCardProps) {
  const t = useTranslations('analytics.reporting.readiness');
  const format = useFormatter();
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('problem')}</TableHead>
            <TableHead className="text-right">{t('encounters')}</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>{t('withoutPrimaryDiagnosis')}</TableCell>
            <TableCell className="text-right tabular-nums">
              {format.number(readiness.encountersWithoutPrimaryDiagnosis)}
            </TableCell>
            <TableCell />
          </TableRow>
          <TableRow>
            <TableCell>{t('unlinkedClinician')}</TableCell>
            <TableCell className="text-right tabular-nums">
              {format.number(readiness.encountersWithUnlinkedClinician)}
            </TableCell>
            <TableCell className="text-right">
              {readiness.encountersWithUnlinkedClinician > 0 ? (
                <Link
                  href="/admin/doctors?missingNik=true"
                  className="text-[13px] font-semibold text-primary"
                >
                  {t('view')}
                </Link>
              ) : null}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </AnalyticsCard>
  );
}
