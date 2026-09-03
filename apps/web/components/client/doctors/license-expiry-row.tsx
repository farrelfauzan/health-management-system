'use client';

import type { DoctorLicenseExpiryRow } from '@hms/shared-types';
import { TableCell, TableRow } from '@hms/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';

type LicenseExpiryTableRowProps = {
  row: DoctorLicenseExpiryRow;
};

/**
 * One licence on the expiry roster (P16-T19).
 *
 * Licence type, number and dates, and nothing else. There is deliberately no
 * "view scan" affordance and no indicator that a scan exists — whether the
 * doctor has uploaded one is private to their vault, and would stay private
 * even from an administrator they had shared it with (FR-E3-35). The row
 * links to the doctor's record, which is where a lapsed licence is actually
 * corrected.
 */
export function LicenseExpiryTableRow({ row }: LicenseExpiryTableRowProps) {
  const t = useTranslations('clinical');
  const router = useRouter();
  const hasExpired = row.daysUntilExpiry < 0;

  return (
    <TableRow
      className="cursor-pointer transition-colors hover:bg-slate-50"
      onClick={() => router.push(`/admin/doctors/${row.doctorId}`)}
    >
      <TableCell className="px-4 py-3 text-sm font-medium text-slate-900">
        {row.doctorName}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{row.type}</TableCell>
      <DataTableMonoCell>{row.licenseNumber}</DataTableMonoCell>
      <DataTableMonoCell className="text-slate-700">{row.expiresAt}</DataTableMonoCell>
      <TableCell className="px-4 text-sm">
        <span className={hasExpired ? 'font-medium text-danger' : 'text-slate-600'}>
          {hasExpired
            ? t('licenceExpiry.daysAgo', { days: Math.abs(row.daysUntilExpiry) })
            : t('licenceExpiry.daysLeft', { days: row.daysUntilExpiry })}
        </span>
      </TableCell>
    </TableRow>
  );
}
