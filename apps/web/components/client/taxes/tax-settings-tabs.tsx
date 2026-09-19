'use client';

import { Tabs, TabsList, TabsTrigger } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TaxAssignmentsPanel } from '#components/client/taxes/tax-assignments-panel';
import { TaxCodesPanel } from '#components/client/taxes/tax-codes-panel';
import { TaxSettingsPanel } from '#components/client/taxes/tax-settings-panel';
import { useTabSearchParam } from '#lib/navigation/use-tab-search-param';
import { TAX_SETTINGS_TABS, type TaxSettingsTab } from '#lib/taxes/tax-settings-tabs';

type TaxSettingsTabsProps = {
  initialTab?: TaxSettingsTab;
  /** Whether this person may read tax codes; without it only the profile shows. */
  canReadTaxCodes: boolean;
};

/**
 * The tax page (P27-T02/T03): the clinic's tax profile, the tax codes with
 * their rates and defaults, and the code on every tariff and medication.
 */
export function TaxSettingsTabs({ initialTab, canReadTaxCodes }: TaxSettingsTabsProps) {
  const t = useTranslations('operations.taxes.tabs');
  const { tab, setTab } = useTabSearchParam<TaxSettingsTab>({
    allowed: canReadTaxCodes ? TAX_SETTINGS_TABS : ['profile'],
    fallback: 'profile',
    initialTab,
  });

  return (
    <div className="space-y-4">
      {canReadTaxCodes ? (
        <Tabs value={tab} onValueChange={(next) => setTab(next as TaxSettingsTab)}>
          <TabsList>
            {TAX_SETTINGS_TABS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(value)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}
      {tab === 'codes' ? <TaxCodesPanel /> : null}
      {tab === 'assignments' ? <TaxAssignmentsPanel /> : null}
      {tab === 'profile' ? <TaxSettingsPanel /> : null}
    </div>
  );
}
