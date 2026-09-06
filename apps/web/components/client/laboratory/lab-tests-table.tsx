'use client';

import type { LabTestView } from '@hms/shared-types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabTestRow } from '#components/client/laboratory/lab-test-row';

type LabTestsTableProps = {
  labTests: LabTestView[];
  isPending: boolean;
  isError: boolean;
};

export function LabTestsTable({ labTests, isPending, isError }: LabTestsTableProps) {
  const t = useTranslations('operations.laboratory');

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.code')}</TableHead>
            <TableHead>{t('columns.name')}</TableHead>
            <TableHead>{t('columns.specimen')}</TableHead>
            <TableHead>{t('columns.result')}</TableHead>
            <TableHead>{t('columns.referenceRange')}</TableHead>
            <TableHead>{t('columns.price')}</TableHead>
            <TableHead>{t('columns.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {labTests.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                {isError ? t('loadError') : isPending ? t('loading') : t('noTests')}
              </TableCell>
            </TableRow>
          ) : (
            labTests.map((labTest) => <LabTestRow key={labTest.id} labTest={labTest} />)
          )}
        </TableBody>
      </Table>
    </div>
  );
}
