'use client';

import type { ServiceTariffResponse } from '@hms/shared-types';
import { Button, TableCell, TableRow } from '@hms/ui';

import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';
import { formatRupiah } from '#lib/billing/format-rupiah';
import { formatStatusLabel } from '#lib/shared/status-label';

type ServiceTariffsTableRowProps = {
  tariff: ServiceTariffResponse;
  canManage: boolean;
  onEdit: (tariff: ServiceTariffResponse) => void;
};

export function ServiceTariffsTableRow({
  tariff,
  canManage,
  onEdit,
}: ServiceTariffsTableRowProps) {
  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <DataTableMonoCell>{tariff.code}</DataTableMonoCell>
      <TableCell className="px-4 py-3 text-sm text-slate-800">{tariff.name}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {formatStatusLabel(tariff.category)}
      </TableCell>
      <TableCell className="px-4 font-mono text-sm text-slate-600">
        {tariff.icd9cmCode ?? '—'}
      </TableCell>
      <TableCell className="px-4 text-sm font-medium text-slate-900">
        {formatRupiah(tariff.price)}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={tariff.isActive ? 'ACTIVE' : 'INACTIVE'} />
      </TableCell>
      <TableCell className="px-4 text-right">
        {canManage ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onEdit(tariff)}>
            Edit
          </Button>
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
