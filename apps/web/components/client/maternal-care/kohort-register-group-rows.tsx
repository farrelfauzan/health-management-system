'use client';

import type { KohortRegisterGroup } from '@hms/shared-types';
import { TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

type KohortRegisterGroupRowsProps = {
  group: KohortRegisterGroup;
  columnCount: number;
};

/** One village's block of a register: a spanning heading row, then its rows. */
export function KohortRegisterGroupRows({ group, columnCount }: KohortRegisterGroupRowsProps) {
  const t = useTranslations('maternalCare.reports.register');
  return (
    <>
      <TableRow className="bg-slate-50">
        <TableCell colSpan={columnCount} className="text-xs font-semibold text-slate-700">
          {t('village')}: {group.villageName}
        </TableCell>
      </TableRow>
      {group.rows.map((row) => (
        <TableRow key={row.id}>
          {row.values.map((value, index) => (
            <TableCell key={index} className="whitespace-nowrap text-xs">
              {value}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
