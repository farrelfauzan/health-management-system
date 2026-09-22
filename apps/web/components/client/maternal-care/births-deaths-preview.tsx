'use client';

import { TableBody, TableCell, TableHeader, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { MaternalReportHeaderLine } from '#components/client/maternal-care/maternal-report-header-line';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { StatCard } from '#components/shared/stat-card';
import { TableSkeleton } from '#components/shared/table-skeleton';
import { useBirthsDeathsReport } from '#lib/maternal-reports/use-births-deaths-report';

const TABLE_COLUMN_COUNT = 5;

type BirthsDeathsPreviewProps = {
  month: string;
};

/** The month's births and deaths on screen, with the coverage note (P25-T15). */
export function BirthsDeathsPreview({ month }: BirthsDeathsPreviewProps) {
  const t = useTranslations('maternalCare.reports.birthsDeaths');
  const tReports = useTranslations('maternalCare.reports');
  const format = useFormatter();
  const report = useBirthsDeathsReport(month, true);

  if (report.isError) {
    return <EmptyState icon="error" title={tReports('loadError')} />;
  }
  if (report.isPending || report.data === undefined) {
    return (
      <DataTable minWidthClassName="min-w-[40rem]">
        <TableBody>
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        </TableBody>
      </DataTable>
    );
  }

  const { summary, births, deaths } = report.data;
  const formatInstant = (value: string): string =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-4">
      <MaternalReportHeaderLine header={report.data.header} />
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        {report.data.coverageNote}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon="child_care"
          label={t('summary.liveBirths')}
          value={String(summary.liveBirths)}
        />
        <StatCard
          icon="sentiment_neutral"
          label={t('summary.stillbirths')}
          value={String(summary.stillbirths)}
        />
        <StatCard
          icon="pregnant_woman"
          label={t('summary.maternalDeaths')}
          value={String(summary.maternalDeaths)}
        />
        <StatCard
          icon="crib"
          label={t('summary.newbornDeaths')}
          value={String(summary.newbornDeaths)}
        />
        <StatCard
          icon="person"
          label={t('summary.otherDeaths')}
          value={String(summary.otherDeaths)}
        />
      </div>
      <h2 className="font-heading text-sm font-semibold text-slate-900">{t('births')}</h2>
      {births.length === 0 ? (
        <EmptyState icon="child_care" title={t('noBirths')} />
      ) : (
        <DataTable minWidthClassName="min-w-[48rem]">
          <TableHeader>
            <TableRow>
              <DataTableHeaderCell>{t('columns.birthAt')}</DataTableHeaderCell>
              <DataTableHeaderCell>{t('columns.outcome')}</DataTableHeaderCell>
              <DataTableHeaderCell>{t('columns.sex')}</DataTableHeaderCell>
              <DataTableHeaderCell className="text-right">
                {t('columns.weight')}
              </DataTableHeaderCell>
              <DataTableHeaderCell>{t('columns.mother')}</DataTableHeaderCell>
              <DataTableHeaderCell>{t('columns.village')}</DataTableHeaderCell>
              <DataTableHeaderCell>{t('columns.attendant')}</DataTableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {births.map((birth) => (
              <TableRow key={birth.id}>
                <TableCell className="text-sm">{formatInstant(birth.birthAt)}</TableCell>
                <TableCell className="text-sm">{t(`outcome.${birth.outcome}`)}</TableCell>
                <TableCell className="text-sm">{t(`sex.${birth.sex}`)}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {birth.birthWeightGrams ?? '—'}
                </TableCell>
                <TableCell className="text-sm">{birth.motherName}</TableCell>
                <TableCell className="text-sm">{birth.villageName ?? t('noVillage')}</TableCell>
                <TableCell className="text-sm">{birth.attendantName}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}
      <h2 className="font-heading text-sm font-semibold text-slate-900">{t('deaths')}</h2>
      {deaths.length === 0 ? (
        <EmptyState icon="inbox" title={t('noDeaths')} />
      ) : (
        <DataTable minWidthClassName="min-w-[40rem]">
          <TableHeader>
            <TableRow>
              <DataTableHeaderCell>{t('columns.diedAt')}</DataTableHeaderCell>
              <DataTableHeaderCell>{t('columns.patientKind')}</DataTableHeaderCell>
              <DataTableHeaderCell>{t('columns.name')}</DataTableHeaderCell>
              <DataTableHeaderCell>{t('columns.age')}</DataTableHeaderCell>
              <DataTableHeaderCell>{t('columns.village')}</DataTableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deaths.map((death) => (
              <TableRow key={death.id}>
                <TableCell className="text-sm">{formatInstant(death.diedAt)}</TableCell>
                <TableCell className="text-sm">{t(`patientKind.${death.patientKind}`)}</TableCell>
                <TableCell className="text-sm">{death.patientName}</TableCell>
                <TableCell className="text-sm">{death.ageLabel}</TableCell>
                <TableCell className="text-sm">{death.villageName ?? t('noVillage')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}
    </div>
  );
}
