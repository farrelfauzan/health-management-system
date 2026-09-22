'use client';

import type { KohortRegisterResponse } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { KohortRegisterGroupRows } from '#components/client/maternal-care/kohort-register-group-rows';
import { MaternalReportHeaderLine } from '#components/client/maternal-care/maternal-report-header-line';
import { MaternalReportProvisionalNotice } from '#components/client/maternal-care/maternal-report-provisional-notice';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const SKELETON_COLUMN_COUNT = 8;

type KohortRegisterPreviewProps = {
  register: KohortRegisterResponse | null;
  isPending: boolean;
  isError: boolean;
};

/** One register on screen, exactly as the CSV lays it out, grouped by village (P25-T15). */
export function KohortRegisterPreview({
  register,
  isPending,
  isError,
}: KohortRegisterPreviewProps) {
  const t = useTranslations('maternalCare.reports');

  if (isPending || register === null) {
    if (isError) {
      return <EmptyState icon="error" title={t('loadError')} />;
    }
    return (
      <DataTable minWidthClassName="min-w-[56rem]">
        <TableBody>
          <TableSkeleton columns={SKELETON_COLUMN_COUNT} />
        </TableBody>
      </DataTable>
    );
  }

  return (
    <div className="space-y-3">
      <MaternalReportHeaderLine header={register.header} />
      {register.isProvisionalLayout ? <MaternalReportProvisionalNotice /> : null}
      {register.totalRows === 0 ? (
        <EmptyState icon="pregnant_woman" title={t('empty')} />
      ) : (
        <DataTable minWidthClassName="min-w-max">
          <TableHeader>
            <TableRow>
              {register.columns.map((column) => (
                <DataTableHeaderCell key={column.field} className="whitespace-nowrap text-xs">
                  {column.label}
                </DataTableHeaderCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {register.groups.map((group) => (
              <KohortRegisterGroupRows
                key={group.villageCode ?? 'tanpa-desa'}
                group={group}
                columnCount={register.columns.length}
              />
            ))}
          </TableBody>
        </DataTable>
      )}
      <p className="text-xs text-slate-500">{t('register.total', { count: register.totalRows })}</p>
    </div>
  );
}
