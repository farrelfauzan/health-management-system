'use client';

import { useState } from 'react';
import type {
  LabOrderBenchView,
  LabOrderItemView,
  LabResultView,
  LabTestView,
  LaboratorySettingsView,
} from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { LabAmendDialog, type LabAmendTarget } from '#components/client/laboratory/lab-amend-dialog';
import { LabReleaseButton } from '#components/client/laboratory/lab-release-button';
import { LabValidationRow } from '#components/client/laboratory/lab-validation-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';

type LabValidationPanelProps = {
  bench: LabOrderBenchView;
  labTestsById: ReadonlyMap<string, LabTestView>;
  settings: LaboratorySettingsView | undefined;
  canVerify: boolean;
  currentUserId: string | null;
  isTechnicianOnly: boolean;
};

/**
 * What is about to be signed out, beside what this patient last had
 * (`P18-T08`), and — once it is out — the amend flow with its reason.
 */
export function LabValidationPanel({
  bench,
  labTestsById,
  settings,
  canVerify,
  currentUserId,
  isTechnicianOnly,
}: LabValidationPanelProps) {
  const t = useTranslations('operations.laboratory.validation');
  const tEntry = useTranslations('operations.laboratory.entry');
  const format = useFormatter();
  const [amendTarget, setAmendTarget] = useState<LabAmendTarget | null>(null);
  const items = bench.order.items.filter((item) => item.status !== 'CANCELLED');
  const current = pickCurrentResults(bench.results);
  const isReleased = bench.order.status === 'RELEASED';

  function handleAmend(item: LabOrderItemView, result: LabResultView): void {
    setAmendTarget({ item, result, labTest: labTestsById.get(item.labTestId) });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-heading text-sm font-semibold text-slate-900">{t('title')}</h3>
          <p className="text-xs text-slate-500">
            {isReleased && bench.order.releasedAt
              ? t('releasedBy', {
                  releasedAt: format.dateTime(new Date(bench.order.releasedAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })
              : t('subtitle')}
          </p>
        </div>
        <LabReleaseButton
          bench={bench}
          settings={settings}
          canVerify={canVerify}
          currentUserId={currentUserId}
          isTechnicianOnly={isTechnicianOnly}
        />
      </div>
      <DataTable minWidthClassName="min-w-[64rem]">
        <TableHeader>
          <TableRow>
            <DataTableHeaderCell>{tEntry('columns.test')}</DataTableHeaderCell>
            <DataTableHeaderCell>{tEntry('columns.value')}</DataTableHeaderCell>
            <DataTableHeaderCell>{tEntry('columns.flag')}</DataTableHeaderCell>
            <DataTableHeaderCell>{tEntry('columns.reference')}</DataTableHeaderCell>
            <DataTableHeaderCell>{t('previous')}</DataTableHeaderCell>
            <DataTableHeaderCell />
            <DataTableHeaderCell className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <LabValidationRow
              key={item.id}
              item={item}
              result={current.get(item.id)}
              patientId={bench.patient.id}
              labOrderId={bench.order.id}
              canAmend={canVerify && isReleased}
              onAmend={handleAmend}
            />
          ))}
        </TableBody>
      </DataTable>
      <LabAmendDialog target={amendTarget} onClose={() => setAmendTarget(null)} />
    </div>
  );
}

function pickCurrentResults(results: readonly LabResultView[]): Map<string, LabResultView> {
  const current = new Map<string, LabResultView>();
  for (const result of results) {
    const existing = current.get(result.labOrderItemId);
    if (!existing || existing.version < result.version) {
      current.set(result.labOrderItemId, result);
    }
  }
  return current;
}
