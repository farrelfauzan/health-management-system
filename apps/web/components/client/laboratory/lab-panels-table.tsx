'use client';

import type { LabPanelView } from '@hms/shared-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabPanelRow } from '#components/client/laboratory/lab-panel-row';

type LabPanelsTableProps = {
  labPanels: LabPanelView[];
  isPending: boolean;
  isError: boolean;
  canManage?: boolean;
  onEdit?: (labPanel: LabPanelView) => void;
};

export function LabPanelsTable({
  labPanels,
  isPending,
  isError,
  canManage = false,
  onEdit,
}: LabPanelsTableProps) {
  const t = useTranslations('operations.laboratory');

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.code')}</TableHead>
            <TableHead>{t('columns.name')}</TableHead>
            <TableHead>{t('columns.members')}</TableHead>
            <TableHead>{t('columns.price')}</TableHead>
            <TableHead>{t('columns.status')}</TableHead>
            {canManage ? (
              <TableHead className="text-right">{t('columns.actions')}</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {labPanels.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canManage ? 6 : 5} className="h-24 text-center text-slate-500">
                {isError ? t('loadError') : isPending ? t('loading') : t('noPanels')}
              </TableCell>
            </TableRow>
          ) : (
            labPanels.map((labPanel) => (
              <LabPanelRow
                key={labPanel.id}
                labPanel={labPanel}
                onEdit={canManage ? onEdit : undefined}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
