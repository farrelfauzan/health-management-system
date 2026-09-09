'use client';

import type { DoctorCredentialOption } from '@hms/shared-types';
import {
  Skeleton,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorCredentialTableRow } from '#components/client/settings/doctor-credential-table-row';

type DoctorCredentialTableProps = {
  options: DoctorCredentialOption[];
  isPending: boolean;
  isError: boolean;
  canManage: boolean;
};

export function DoctorCredentialTable({
  options,
  isPending,
  isError,
  canManage,
}: DoctorCredentialTableProps) {
  const t = useTranslations('operations.doctorCredentials');

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

  if (options.length === 0) {
    return <p className="text-sm text-slate-500">{t('empty')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.label')}</TableHead>
            <TableHead>{t('columns.code')}</TableHead>
            <TableHead>{t('columns.sortOrder')}</TableHead>
            <TableHead>{t('columns.status')}</TableHead>
            {canManage ? <TableHead>{t('columns.actions')}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {options.map((option) => (
            <DoctorCredentialTableRow key={option.id} option={option} canManage={canManage} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
