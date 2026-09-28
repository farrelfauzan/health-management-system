'use client';

import { Icon, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import type { AnalyticsSubmissionTableRow } from '#lib/analytics/analytics-filter-state';

type AnalyticsSubmissionTableCardProps = {
  title: string;
  subtitle: string;
  rows: AnalyticsSubmissionTableRow[];
  note?: ReactNode;
};

/**
 * Submissions per kind: sent in the period, pending and failed now, and a
 * "Perbaiki" link into the filtered submission list for anything failed.
 */
export function AnalyticsSubmissionTableCard({
  title,
  subtitle,
  rows,
  note,
}: AnalyticsSubmissionTableCardProps) {
  const t = useTranslations('analytics.reporting');
  const format = useFormatter();
  return (
    <AnalyticsCard title={title} subtitle={subtitle} className="flex-1">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.kind')}</TableHead>
            <TableHead className="text-right">{t('columns.submitted')}</TableHead>
            <TableHead className="text-right">{t('columns.pending')}</TableHead>
            <TableHead className="text-right">{t('columns.failed')}</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">{t('columns.action')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-slate-500">
                {t('noSubmissions')}
              </TableCell>
            </TableRow>
          ) : null}
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell>{row.label}</TableCell>
              <TableCell className="text-right tabular-nums">
                {format.number(row.submitted)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {format.number(row.pending)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.failed > 0 ? (
                  <span className="rounded-full bg-danger-tint px-2 py-0.5 font-medium text-danger">
                    {format.number(row.failed)}
                  </span>
                ) : (
                  '0'
                )}
              </TableCell>
              <TableCell className="text-right">
                {row.fixHref && row.failed > 0 ? (
                  <Link
                    href={row.fixHref}
                    aria-label={t('fixLabel', {
                      count: format.number(row.failed),
                      kind: row.label,
                    })}
                    className="text-[13px] font-semibold text-primary"
                  >
                    {t('fix')}
                  </Link>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {note ? (
        <div className="flex items-start gap-2 rounded-[10px] bg-surface-container-low px-3 py-2.5 text-xs text-on-surface-variant">
          <Icon name="info" size={16} className="text-primary" />
          <span>{note}</span>
        </div>
      ) : null}
    </AnalyticsCard>
  );
}
