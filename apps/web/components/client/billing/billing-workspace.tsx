'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { CashierReportPanel } from '#components/client/billing/cashier-report-panel';
import { InvoicesPanel } from '#components/client/billing/invoices-panel';
import { ServiceTariffsPanel } from '#components/client/billing/service-tariffs-panel';
import { DocumentTemplatesPanel } from '#components/client/document-templates/document-templates-panel';
import { PageHeader } from '#components/shared/page-header';

type BillingWorkspaceProps = {
  /**
   * Who is looking. Only the template approval half reads it (`P16-T32`),
   * to say "you are the only approver" before the API refuses the submission
   * for the same reason (FR-E5-14).
   */
  currentUserId: string | null;
};

export function BillingWorkspace({ currentUserId }: BillingWorkspaceProps) {
  const t = useTranslations('operations.billing');
  const ability = useAbility();
  const canReadInvoices = ability.can('read', 'Invoice');
  const canReadTariffs = ability.can('read', 'ServiceTariff');
  const canReadTemplates = ability.can('read', 'DocumentTemplate');
  const defaultTab = resolveDefaultTab();

  function resolveDefaultTab(): string {
    if (canReadInvoices) {
      return 'invoices';
    }
    return canReadTariffs ? 'tariffs' : 'templates';
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} breadcrumbs={[t('title')]} />
      <Tabs defaultValue={defaultTab} className="space-y-5">
        <TabsList>
          {canReadInvoices ? <TabsTrigger value="invoices">{t('invoices')}</TabsTrigger> : null}
          {canReadTariffs ? <TabsTrigger value="tariffs">{t('tariffs')}</TabsTrigger> : null}
          {canReadInvoices ? <TabsTrigger value="report">{t('dailyReport')}</TabsTrigger> : null}
          {canReadTemplates ? (
            <TabsTrigger value="templates">{t('templates.tab')}</TabsTrigger>
          ) : null}
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
        {canReadTemplates ? (
          <TabsContent value="templates">
            <DocumentTemplatesPanel currentUserId={currentUserId} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
