'use client';

import type { RegistrationListItem } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RegistrationsTableRow } from '#components/client/registrations/registrations-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';
import type { RegistrationTransitionTarget } from '#lib/registrations/registration-transition-meta';
import type { RegistrationsViewVariant } from '#lib/registrations/registrations-view-variant';

const TABLE_COLUMN_COUNT = 8;

type RegistrationsTableProps = {
  registrations: RegistrationListItem[];
  variant: RegistrationsViewVariant;
  isPending: boolean;
  isError: boolean;
  onTransition: (registration: RegistrationListItem, target: RegistrationTransitionTarget) => void;
  onOpenEncounter: (registration: RegistrationListItem) => void;
};

export function RegistrationsTable({
  registrations,
  variant,
  isPending,
  isError,
  onTransition,
  onOpenEncounter,
}: RegistrationsTableProps) {
  const t = useTranslations('operations');
  const showEmptyState = !isPending && registrations.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'how_to_reg'}
        title={isError ? t('registrations.errorTitle') : t('registrations.emptyTitle')}
        description={
          isError ? t('registrations.errorDescription') : t('registrations.emptyDescription')
        }
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('common.patient')}</DataTableHeaderCell>
          <DataTableHeaderCell>ID</DataTableHeaderCell>
          <DataTableHeaderCell>{t('registrations.labels.registered')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('registrations.labels.linkedAppointment')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.doctor')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.status')}</DataTableHeaderCell>
          <DataTableHeaderCell>BPJS</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          registrations.map((registration) => (
            <RegistrationsTableRow
              key={registration.id}
              registration={registration}
              variant={variant}
              onTransition={onTransition}
              onOpenEncounter={onOpenEncounter}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
