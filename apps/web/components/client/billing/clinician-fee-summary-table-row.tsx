'use client';

import type { ClinicianFeeClinicianSummaryView } from '@hms/shared-types';
import { Button, TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { formatRupiah } from '#lib/billing/format-rupiah';

type ClinicianFeeSummaryTableRowProps = {
  clinician: ClinicianFeeClinicianSummaryView;
  onView: (doctorId: string) => void;
};

export function ClinicianFeeSummaryTableRow({
  clinician,
  onView,
}: ClinicianFeeSummaryTableRowProps) {
  const t = useTranslations('operations.billing.fees.statements');

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3 text-sm text-slate-800">{clinician.doctorName}</TableCell>
      <TableCell className="px-4 text-right text-sm text-slate-600">
        {clinician.totals.entryCount}
      </TableCell>
      <TableCell className="px-4 text-right text-sm text-slate-600">
        {formatRupiah(clinician.totals.lineAmount)}
      </TableCell>
      <TableCell className="px-4 text-right text-sm font-medium text-slate-900">
        {formatRupiah(clinician.totals.grossFee)}
      </TableCell>
      <TableCell className="px-4 text-right text-sm text-slate-600">
        {formatRupiah(clinician.totals.clinicShare)}
      </TableCell>
      <TableCell className="px-4 text-right">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onView(clinician.doctorId)}
        >
          {t('view')}
        </Button>
      </TableCell>
    </TableRow>
  );
}
