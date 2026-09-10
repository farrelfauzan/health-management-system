'use client';

import { useState } from 'react';
import type { LabPanelView, LabTestView } from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabPanelFormDialog } from '#components/client/laboratory/lab-panel-form-dialog';
import { LabPanelsTable } from '#components/client/laboratory/lab-panels-table';
import { LabTestFormDialog } from '#components/client/laboratory/lab-test-form-dialog';
import { LabTestsTable } from '#components/client/laboratory/lab-tests-table';
import { LAB_CATALOG_TABS, type LabCatalogTab } from '#lib/laboratory/lab-catalog-tabs';
import { useLabPanels } from '#lib/laboratory/use-lab-panels';
import { useLabTests } from '#lib/laboratory/use-lab-tests';
import { useTabSearchParam } from '#lib/navigation/use-tab-search-param';

type LabCatalogPanelProps = {
  /** A tab asked for by the URL, `tests` or `panels` (SJ-162). */
  initialTab?: LabCatalogTab;
};

type TestDialogState = { isOpen: boolean; labTest: LabTestView | null };

type PanelDialogState = { isOpen: boolean; labPanel: LabPanelView | null };

/**
 * The laboratory catalog (`P18-T01`, editable since `P18-T15`): what the
 * clinic can test for, what each result means, which tests are sold
 * together, and what each costs. The tables stay readable to anyone with the
 * read grant; the buttons render only for `lab-test.write` — visibility
 * only, `PermissionsGuard` refuses the four write routes regardless.
 */
export function LabCatalogPanel({ initialTab }: LabCatalogPanelProps) {
  const t = useTranslations('operations.laboratory');
  const ability = useAbility();
  const canManage = ability.can('write', 'LabTest');
  const { tab, setTab } = useTabSearchParam<LabCatalogTab>({
    allowed: LAB_CATALOG_TABS,
    fallback: 'tests',
    initialTab,
  });
  const [search, setSearch] = useState<string>('');
  const [testDialog, setTestDialog] = useState<TestDialogState>({ isOpen: false, labTest: null });
  const [panelDialog, setPanelDialog] = useState<PanelDialogState>({
    isOpen: false,
    labPanel: null,
  });
  const testsQuery = useLabTests(search);
  const panelsQuery = useLabPanels(search);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          {canManage ? (
            <Button
              type="button"
              size="sm"
              className="bg-primary-container hover:bg-primary"
              onClick={() =>
                tab === 'tests'
                  ? setTestDialog({ isOpen: true, labTest: null })
                  : setPanelDialog({ isOpen: true, labPanel: null })
              }
              data-testid="lab-catalog-new"
            >
              <Icon name="add" size={18} />
              {tab === 'tests' ? t('catalog.newTest') : t('catalog.newPanel')}
            </Button>
          ) : null}
        </div>
        <Tabs value={tab} onValueChange={(value) => setTab(value as LabCatalogTab)}>
          <TabsList>
            <TabsTrigger value="tests">{t('tabs.tests')}</TabsTrigger>
            <TabsTrigger value="panels">{t('tabs.panels')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          className="w-72"
          value={search}
          aria-label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          onChange={(event) => setSearch(event.target.value)}
        />
        {tab === 'tests' ? (
          <LabTestsTable
            labTests={testsQuery.labTests}
            isPending={testsQuery.isPending}
            isError={testsQuery.isError}
            canManage={canManage}
            onEdit={(labTest) => setTestDialog({ isOpen: true, labTest })}
          />
        ) : (
          <LabPanelsTable
            labPanels={panelsQuery.labPanels}
            isPending={panelsQuery.isPending}
            isError={panelsQuery.isError}
            canManage={canManage}
            onEdit={(labPanel) => setPanelDialog({ isOpen: true, labPanel })}
          />
        )}
      </CardContent>
      {testDialog.isOpen ? (
        <LabTestFormDialog
          key={testDialog.labTest?.id ?? 'new-test'}
          open={testDialog.isOpen}
          labTest={testDialog.labTest}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setTestDialog({ isOpen: false, labTest: null });
            }
          }}
        />
      ) : null}
      {panelDialog.isOpen ? (
        <LabPanelFormDialog
          key={panelDialog.labPanel?.id ?? 'new-panel'}
          open={panelDialog.isOpen}
          labPanel={panelDialog.labPanel}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setPanelDialog({ isOpen: false, labPanel: null });
            }
          }}
        />
      ) : null}
    </Card>
  );
}
