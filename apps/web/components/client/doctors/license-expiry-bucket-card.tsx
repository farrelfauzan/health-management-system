'use client';

import type { DoctorLicenseExpiryRow } from '@hms/shared-types';
import { Card, CardContent, TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LicenseExpiryTableRow } from '#components/client/doctors/license-expiry-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 5;

type LicenseExpiryBucketCardProps = {
  title: string;
  description: string;
  rows: DoctorLicenseExpiryRow[];
  isPending: boolean;
  emptyMessage: string;
};

/**
 * One urgency bucket of the expiry roster (P16-T19, FR-E3-33).
 *
 * An empty bucket renders its own reassuring line rather than disappearing:
 * "nothing lapses in the next 30 days" is the answer an administrator came
 * for, and a screen that hides the question leaves them unsure whether it was
 * asked.
 */
export function LicenseExpiryBucketCard({
  title,
  description,
  rows,
  isPending,
  emptyMessage,
}: LicenseExpiryBucketCardProps) {
  const t = useTranslations('clinical');

  return (
    <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="font-heading text-sm font-semibold text-slate-900">
          {title}
          <span className="ml-2 text-xs font-normal text-slate-500">({rows.length})</span>
        </h2>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <CardContent className="p-0">
        {!isPending && rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          <DataTable>
            <TableHeader>
              <TableRow>
                <DataTableHeaderCell>{t('licenceExpiry.columns.doctor')}</DataTableHeaderCell>
                <DataTableHeaderCell>{t('licenceExpiry.columns.type')}</DataTableHeaderCell>
                <DataTableHeaderCell>{t('licenceExpiry.columns.number')}</DataTableHeaderCell>
                <DataTableHeaderCell>{t('licenceExpiry.columns.expiresAt')}</DataTableHeaderCell>
                <DataTableHeaderCell>{t('licenceExpiry.columns.countdown')}</DataTableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableSkeleton columns={TABLE_COLUMN_COUNT} />
              ) : (
                rows.map((row) => <LicenseExpiryTableRow key={row.licenseId} row={row} />)
              )}
            </TableBody>
          </DataTable>
        )}
      </CardContent>
    </Card>
  );
}
