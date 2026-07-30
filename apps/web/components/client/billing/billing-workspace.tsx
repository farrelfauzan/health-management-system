'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { CashierReportPanel } from '#components/client/billing/cashier-report-panel';
import { InvoicesPanel } from '#components/client/billing/invoices-panel';
import { ServiceTariffsPanel } from '#components/client/billing/service-tariffs-panel';
import { PageHeader } from '#components/shared/page-header';

export function BillingWorkspace() {
  const t = useTranslations('operations.billing');
  const ability = useAbility();
  const canReadInvoices = ability.can('read', 'Invoice');
  const canReadTariffs = ability.can('read', 'ServiceTariff');
  const defaultTab = canReadInvoices ? 'invoices' : 'tariffs';

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} breadcrumbs={[t('title')]} />
      <Tabs defaultValue={defaultTab} className="space-y-5">
        <TabsList>
          {canReadInvoices ? <TabsTrigger value="invoices">{t('invoices')}</TabsTrigger> : null}
          {canReadTariffs ? <TabsTrigger value="tariffs">{t('tariffs')}</TabsTrigger> : null}
          {canReadInvoices ? <TabsTrigger value="report">{t('dailyReport')}</TabsTrigger> : null}
        </TabsList>
        {canReadInvoices ? (
          <TabsContent value="invoices">
            <InvoicesPanel />
          </TabsContent>
        ) : null}
        {canReadTariffs ? (
          <TabsContent value="tariffs">
            <ServiceTariffsPanel />
          </TabsContent>
        ) : null}
        {canReadInvoices ? (
          <TabsContent value="report">
            <CashierReportPanel />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
