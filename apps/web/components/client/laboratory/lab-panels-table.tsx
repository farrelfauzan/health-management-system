'use client';

import type { LabPanelView } from '@hms/shared-types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabPanelRow } from '#components/client/laboratory/lab-panel-row';

type LabPanelsTableProps = {
  labPanels: LabPanelView[];
  isPending: boolean;
  isError: boolean;
};

export function LabPanelsTable({ labPanels, isPending, isError }: LabPanelsTableProps) {
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {labPanels.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                {isError ? t('loadError') : isPending ? t('loading') : t('noPanels')}
              </TableCell>
            </TableRow>
          ) : (
            labPanels.map((labPanel) => <LabPanelRow key={labPanel.id} labPanel={labPanel} />)
          )}
        </TableBody>
      </Table>
    </div>
  );
}
