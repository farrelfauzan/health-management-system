'use client';

import { useState } from 'react';
import type { LabSpecimenView } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabPrintLabelsButton } from '#components/client/laboratory/lab-print-labels-button';
import { LabSpecimenRejectDialog } from '#components/client/laboratory/lab-specimen-reject-dialog';
import { LabSpecimenRow } from '#components/client/laboratory/lab-specimen-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';

type LabSpecimensTableProps = {
  specimens: LabSpecimenView[];
};

/** The tubes drawn for this order, with reprint, receive and reject (`P18-T08`). */
export function LabSpecimensTable({ specimens }: LabSpecimensTableProps) {
  const t = useTranslations('operations.laboratory.specimens');
  const ability = useAbility();
  const canWrite = ability.can('write', 'LabSpecimen');
  const [rejectTarget, setRejectTarget] = useState<LabSpecimenView | null>(null);
  const liveIds = specimens
    .filter((specimen) => specimen.status !== 'REJECTED')
    .map((specimen) => specimen.id);

  if (specimens.length === 0) {
    return <EmptyState icon="science" title={t('empty')} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <LabPrintLabelsButton specimenIds={liveIds} />
      </div>
      <DataTable minWidthClassName="min-w-[52rem]">
        <TableHeader>
          <TableRow>
            <DataTableHeaderCell>{t('accession')}</DataTableHeaderCell>
            <DataTableHeaderCell>{t('type')}</DataTableHeaderCell>
            <DataTableHeaderCell>{t('collectedAt')}</DataTableHeaderCell>
            <DataTableHeaderCell>{t('receivedAt')}</DataTableHeaderCell>
            <DataTableHeaderCell>{t('status')}</DataTableHeaderCell>
            <DataTableHeaderCell className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {specimens.map((specimen) => (
            <LabSpecimenRow
              key={specimen.id}
              specimen={specimen}
              canWrite={canWrite}
              onReject={setRejectTarget}
            />
          ))}
        </TableBody>
      </DataTable>
      <LabSpecimenRejectDialog specimen={rejectTarget} onClose={() => setRejectTarget(null)} />
    </div>
  );
}
