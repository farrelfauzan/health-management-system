'use client';

import { useState } from 'react';
import { Label, MultiCombobox, type MultiComboboxOption } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useLabPanels } from '#lib/laboratory/use-lab-panels';
import { useLabTests } from '#lib/laboratory/use-lab-tests';

type EncounterLabTestPickerProps = {
  testIds: string[];
  panelIds: string[];
  onTestIdsChange: (testIds: string[]) => void;
  onPanelIdsChange: (panelIds: string[]) => void;
  disabled?: boolean;
};

/**
 * Picks what to ask the laboratory for: panels first, then loose tests
 * (`P18-T07`).
 *
 * Two lists rather than one merged one, because a panel is a thing a clinic
 * sells as a unit — the member preview on each panel row is what stops a doctor
 * ordering darah rutin and then adding haemoglobin again on top of it, which
 * the API would refuse as a duplicate anyway.
 */
export function EncounterLabTestPicker({
  testIds,
  panelIds,
  onTestIdsChange,
  onPanelIdsChange,
  disabled = false,
}: EncounterLabTestPickerProps) {
  const t = useTranslations('clinical');
  const [testSearch, setTestSearch] = useState<string>('');
  const [panelSearch, setPanelSearch] = useState<string>('');
  const testsQuery = useLabTests(testSearch);
  const panelsQuery = useLabPanels(panelSearch);
  const testOptions: MultiComboboxOption[] = testsQuery.labTests
    .filter((labTest) => labTest.isActive)
    .map((labTest) => ({
      value: labTest.id,
      label: labTest.name,
      description: labTest.code,
      keywords: [labTest.code],
    }));
  const panelOptions: MultiComboboxOption[] = panelsQuery.labPanels
    .filter((panel) => panel.isActive)
    .map((panel) => ({
      value: panel.id,
      label: panel.name,
      // The member preview: what the doctor is actually ordering when they
      // pick one line.
      description: panel.members.map((member) => member.code).join(', '),
      keywords: [panel.code],
    }));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Label className="block space-y-1 text-sm font-normal">
        <span className="font-medium text-slate-700">
          {t('encounters.laboratory.form.panels')}
        </span>
        <MultiCombobox
          options={panelOptions}
          values={panelIds}
          onChange={onPanelIdsChange}
          searchValue={panelSearch}
          onSearchValueChange={setPanelSearch}
          shouldFilter={false}
          isLoading={panelsQuery.isPending}
          disabled={disabled}
          placeholder={t('encounters.laboratory.form.panelsPlaceholder')}
          searchPlaceholder={t('encounters.laboratory.form.search')}
          emptyMessage={t('encounters.laboratory.form.noMatches')}
        />
      </Label>
      <Label className="block space-y-1 text-sm font-normal">
        <span className="font-medium text-slate-700">
          {t('encounters.laboratory.form.tests')}
        </span>
        <MultiCombobox
          options={testOptions}
          values={testIds}
          onChange={onTestIdsChange}
          searchValue={testSearch}
          onSearchValueChange={setTestSearch}
          shouldFilter={false}
          isLoading={testsQuery.isPending}
          disabled={disabled}
          placeholder={t('encounters.laboratory.form.testsPlaceholder')}
          searchPlaceholder={t('encounters.laboratory.form.search')}
          emptyMessage={t('encounters.laboratory.form.noMatches')}
        />
      </Label>
    </div>
  );
}
