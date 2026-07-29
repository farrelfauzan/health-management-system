'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';

import { CashierReportPanel } from '#components/client/billing/cashier-report-panel';
import { InvoicesPanel } from '#components/client/billing/invoices-panel';
import { ServiceTariffsPanel } from '#components/client/billing/service-tariffs-panel';
import { PageHeader } from '#components/shared/page-header';
import { ADMIN_ROUTE_METADATA } from '#lib/shell/route-metadata';

export function BillingWorkspace() {
  const ability = useAbility();
  const metadata = ADMIN_ROUTE_METADATA.billing;
  const canReadInvoices = ability.can('read', 'Invoice');
  const canReadTariffs = ability.can('read', 'ServiceTariff');
  const defaultTab = canReadInvoices ? 'invoices' : 'tariffs';

  return (
    <div className="space-y-6">
      <PageHeader
        title={metadata.title}
        subtitle={metadata.subtitle}
        breadcrumbs={[...metadata.breadcrumbs]}
      />
      <Tabs defaultValue={defaultTab} className="space-y-5">
        <TabsList>
          {canReadInvoices ? <TabsTrigger value="invoices">Invoices</TabsTrigger> : null}
          {canReadTariffs ? <TabsTrigger value="tariffs">Tariffs</TabsTrigger> : null}
          {canReadInvoices ? <TabsTrigger value="report">Daily report</TabsTrigger> : null}
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
