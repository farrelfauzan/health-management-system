'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InventoryPanel } from '#components/client/pharmacy/inventory-panel';
import { PharmacyPanel } from '#components/client/pharmacy/pharmacy-panel';
import type { PharmacySearchParams } from '#lib/pharmacy/search-params';

type PharmacyWorkspaceProps = {
  initialQuery: PharmacySearchParams;
};

export function PharmacyWorkspace({ initialQuery }: PharmacyWorkspaceProps) {
  const t = useTranslations('pharmacyInventory');
  const ability = useAbility();
  const canReadQueue = ability.can('read', 'Prescription');
  const canReadInventory = ability.can('read', 'Medication') && ability.can('read', 'Inventory');
  const defaultTab = canReadQueue ? 'queue' : 'inventory';

  return (
    <Tabs defaultValue={defaultTab} className="space-y-5">
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
