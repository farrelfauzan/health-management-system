'use client';

import type { TaxCodeView } from '@hms/shared-types';
import { Skeleton, Table, TableBody, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TaxCodesTableRow } from '#components/client/taxes/tax-codes-table-row';

type TaxCodesTableProps = {
  taxCodes: TaxCodeView[];
  isPending: boolean;
  isError: boolean;
  canWrite: boolean;
  onEdit: (taxCode: TaxCodeView) => void;
  onAddRate: (taxCode: TaxCodeView) => void;
};

export function TaxCodesTable({
  taxCodes,
  isPending,
  isError,
  canWrite,
  onEdit,
  onAddRate,
}: TaxCodesTableProps) {
  const t = useTranslations('operations.taxes.codes');

  if (isPending) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (isError) {
    return (
      <p role="alert" className="text-sm text-rose-700">
        {t('loadError')}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.code')}</TableHead>
            <TableHead>{t('columns.treatment')}</TableHead>
            <TableHead>{t('columns.faktur')}</TableHead>
            <TableHead>{t('columns.rate')}</TableHead>
            <TableHead>{t('columns.usage')}</TableHead>
            <TableHead>{t('columns.status')}</TableHead>
            {canWrite ? <TableHead>{t('columns.actions')}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {taxCodes.map((taxCode) => (
            <TaxCodesTableRow
              key={taxCode.id}
              taxCode={taxCode}
              canWrite={canWrite}
              onEdit={onEdit}
              onAddRate={onAddRate}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
