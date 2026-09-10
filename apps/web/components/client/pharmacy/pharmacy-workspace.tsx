'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InventoryPanel } from '#components/client/pharmacy/inventory-panel';
import { PharmacyPanel } from '#components/client/pharmacy/pharmacy-panel';
import { useTabSearchParam } from '#lib/navigation/use-tab-search-param';
import { PHARMACY_TABS, type PharmacyTab } from '#lib/pharmacy/pharmacy-tabs';
import type { PharmacySearchParams } from '#lib/pharmacy/search-params';

type PharmacyWorkspaceProps = {
  initialQuery: PharmacySearchParams;
  /** A tab asked for by the URL; honoured only when this person may see it (SJ-162). */
  initialTab?: PharmacyTab;
};

export function PharmacyWorkspace({ initialQuery, initialTab }: PharmacyWorkspaceProps) {
  const t = useTranslations('pharmacyInventory');
  const ability = useAbility();
  const canReadQueue = ability.can('read', 'Prescription');
  const canReadInventory = ability.can('read', 'Medication') && ability.can('read', 'Inventory');
  const readableTabs: Record<PharmacyTab, boolean> = {
    queue: canReadQueue,
    inventory: canReadInventory,
  };
  const { tab, setTab } = useTabSearchParam<PharmacyTab>({
    allowed: PHARMACY_TABS.filter((candidate) => readableTabs[candidate]),
    fallback: canReadQueue ? 'queue' : 'inventory',
    initialTab,
  });

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as PharmacyTab)}
      className="space-y-5"
    >
        <TabsList>
          {canReadQueue ? <TabsTrigger value="queue">{t('queueTab')}</TabsTrigger> : null}
          {canReadInventory ? (
            <TabsTrigger value="inventory">{t('inventoryTab')}</TabsTrigger>
          ) : null}
        </TabsList>
        {canReadQueue ? (
          <TabsContent value="queue">
            <PharmacyPanel initialQuery={initialQuery} />
          </TabsContent>
        ) : null}
        {canReadInventory ? (
          <TabsContent value="inventory">
            <InventoryPanel />
          </TabsContent>
        ) : null}
    </Tabs>
  );
}
