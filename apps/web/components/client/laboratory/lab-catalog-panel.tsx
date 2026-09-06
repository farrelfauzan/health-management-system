'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabPanelsTable } from '#components/client/laboratory/lab-panels-table';
import { LabTestsTable } from '#components/client/laboratory/lab-tests-table';
import { useLabPanels } from '#lib/laboratory/use-lab-panels';
import { useLabTests } from '#lib/laboratory/use-lab-tests';

type CatalogTab = 'tests' | 'panels';

/**
 * The laboratory catalog, read-only in `P18-T01`: what the clinic can test
 * for, what each result means, and which tests are sold together. Editing
 * arrives with the ordering flow that gives it a reason to change.
 */
export function LabCatalogPanel() {
  const t = useTranslations('operations.laboratory');
  const [tab, setTab] = useState<CatalogTab>('tests');
  const [search, setSearch] = useState<string>('');
  const testsQuery = useLabTests(search);
  const panelsQuery = useLabPanels(search);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </div>
        <Tabs value={tab} onValueChange={(value) => setTab(value as CatalogTab)}>
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
          />
        ) : (
          <LabPanelsTable
            labPanels={panelsQuery.labPanels}
            isPending={panelsQuery.isPending}
            isError={panelsQuery.isError}
          />
        )}
      </CardContent>
    </Card>
  );
}
