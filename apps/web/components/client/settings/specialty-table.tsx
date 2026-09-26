'use client';

import type { Specialty } from '@hms/shared-types';
import { Skeleton, Table, TableBody, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { SpecialtyTableRow } from '#components/client/settings/specialty-table-row';

type SpecialtyTableProps = {
  specialties: Specialty[];
  isPending: boolean;
  isError: boolean;
  canManage: boolean;
  onEdit: (specialty: Specialty) => void;
};

export function SpecialtyTable({
  specialties,
  isPending,
  isError,
  canManage,
  onEdit,
}: SpecialtyTableProps) {
  const t = useTranslations('operations.specialties');

  if (isPending) {
    return <Skeleton className="h-40 w-full" aria-label={t('loading')} />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-rose-700">
        {t('loadError')}
      </p>
    );
  }

  if (specialties.length === 0) {
    return <p className="text-sm text-slate-500">{t('empty')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.name')}</TableHead>
            <TableHead>{t('columns.description')}</TableHead>
            <TableHead>{t('columns.status')}</TableHead>
            {canManage ? <TableHead>{t('columns.actions')}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {specialties.map((specialty) => (
            <SpecialtyTableRow
              key={specialty.id}
              specialty={specialty}
              canManage={canManage}
              onEdit={onEdit}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
