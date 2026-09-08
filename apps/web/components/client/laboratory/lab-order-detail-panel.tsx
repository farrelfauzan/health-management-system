'use client';

import { useMemo } from 'react';
import type { LabTestView } from '@hms/shared-types';
import { Button, Icon, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { LabOrderHistory } from '#components/client/laboratory/lab-order-history';
import { LabOrderSummaryCard } from '#components/client/laboratory/lab-order-summary-card';
import { LabReportVersions } from '#components/client/laboratory/lab-report-versions';
import { LabResultEntryForm } from '#components/client/laboratory/lab-result-entry-form';
import { LabSpecimensTable } from '#components/client/laboratory/lab-specimens-table';
import { LabValidationPanel } from '#components/client/laboratory/lab-validation-panel';
import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import { useLabOrderBench } from '#lib/laboratory/use-lab-order-bench';
import { useLabTests } from '#lib/laboratory/use-lab-tests';
import { useLaboratorySettings } from '#lib/laboratory/use-laboratory-settings';

const ENTRY_STATUSES = ['COLLECTED', 'IN_PROGRESS', 'RESULTED'] as const;

type LabOrderDetailPanelProps = {
  labOrderId: string;
  currentUserId: string | null;
  isTechnicianOnly: boolean;
};

/**
 * One order, end to end (`P18-T08`): tubes, the worksheet, the signature, the
 * sheet, and what has happened so far. Which of the worksheet and the
 * validation view appear is the order's status, not the viewer's role — the
 * role decides only whether the buttons inside them render.
 */
export function LabOrderDetailPanel({
  labOrderId,
  currentUserId,
  isTechnicianOnly,
}: LabOrderDetailPanelProps) {
  const t = useTranslations('operations.laboratory.order');
  const tEntry = useTranslations('operations.laboratory.entry');
  const tWorklist = useTranslations('operations.laboratory.worklist');
  const ability = useAbility();
  const canWriteResults = ability.can('write', 'LabResult');
  const canVerify = ability.can('verify', 'LabResult');
  const canReadCatalog = ability.can('read', 'LabTest');
  const bench = useLabOrderBench(labOrderId);
  const tests = useLabTests('');
  const settings = useLaboratorySettings(canVerify && ability.can('read', 'LaboratorySettings'));
  const labTestsById = useMemo(
    () => new Map<string, LabTestView>(tests.labTests.map((test) => [test.id, test])),
    [tests.labTests],
  );

  if (bench.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (bench.isError || !bench.bench) {
    return <EmptyState icon="error" title={t('loadError')} />;
  }

  const { order, patient } = bench.bench;
  const isEntryOpen =
    canWriteResults &&
    order.fulfilmentSite === 'INTERNAL' &&
    ENTRY_STATUSES.some((status) => status === order.status);
  const isValidationOpen = order.status === 'RESULTED' || order.status === 'RELEASED';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title', { orderNumber: order.orderNumber })}
        breadcrumbs={[tWorklist('title'), order.orderNumber]}
        actions={
          <Button asChild type="button" variant="outline" size="sm">
            <Link href="/admin/laboratory">
              <Icon name="arrow_back" size={16} />
              {t('back')}
            </Link>
          </Button>
        }
      />
      <LabOrderSummaryCard order={order} patient={patient} />
      <Tabs defaultValue={isValidationOpen || isEntryOpen ? 'results' : 'specimens'}>
        <TabsList>
          <TabsTrigger value="specimens">{t('tabs.specimens')}</TabsTrigger>
          <TabsTrigger value="results">{t('tabs.results')}</TabsTrigger>
          <TabsTrigger value="documents">{t('tabs.documents')}</TabsTrigger>
          <TabsTrigger value="history">{t('tabs.history')}</TabsTrigger>
        </TabsList>
        <TabsContent value="specimens" className="pt-4">
          <LabSpecimensTable specimens={order.specimens} />
        </TabsContent>
        <TabsContent value="results" className="space-y-6 pt-4">
          {order.fulfilmentSite === 'EXTERNAL' ? (
            <p className="text-sm text-slate-600">{tEntry('external')}</p>
          ) : order.status === 'ORDERED' ? (
            <p className="text-sm text-slate-600">{tEntry('locked')}</p>
          ) : null}
          {isEntryOpen && canReadCatalog ? (
            <LabResultEntryForm bench={bench.bench} labTestsById={labTestsById} />
          ) : null}
          {order.status === 'RELEASED' && canWriteResults ? (
            <p className="text-sm text-slate-600">{tEntry('released')}</p>
          ) : null}
          {isValidationOpen ? (
            <LabValidationPanel
              bench={bench.bench}
              labTestsById={labTestsById}
              settings={settings.settings}
              canVerify={canVerify}
              currentUserId={currentUserId}
              isTechnicianOnly={isTechnicianOnly}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="documents" className="pt-4">
          <LabReportVersions labOrderId={labOrderId} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <LabOrderHistory order={order} results={bench.bench.results} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
