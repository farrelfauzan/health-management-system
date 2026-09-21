'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { CashierReportPanel } from '#components/client/billing/cashier-report-panel';
import { ClinicianFeesPanel } from '#components/client/billing/clinician-fees-panel';
import { InvoicesPanel } from '#components/client/billing/invoices-panel';
import { ServiceTariffsPanel } from '#components/client/billing/service-tariffs-panel';
import { DocumentTemplatesPanel } from '#components/client/document-templates/document-templates-panel';
import { PageHeader } from '#components/shared/page-header';
import { BILLING_TABS, type BillingTab } from '#lib/billing/billing-tab';
import { useShellBreadcrumbRoot } from '#lib/navigation/use-shell-breadcrumb-root';
import { useTabSearchParam } from '#lib/navigation/use-tab-search-param';

type BillingWorkspaceProps = {
  /**
   * Who is looking. Only the template approval half reads it (`P16-T32`),
   * to say "you are the only approver" before the API refuses the submission
   * for the same reason (FR-E5-14).
   */
  currentUserId: string | null;
  /** A tab asked for by the URL (SJ-156); honoured only when this person may read it. */
  initialTab?: BillingTab;
  /** The clinic-local current month, `YYYY-MM`, for the jasa medis statement (P27-T06). */
  currentPeriod: string;
};

export function BillingWorkspace({
  currentUserId,
  initialTab,
  currentPeriod,
}: BillingWorkspaceProps) {
  const t = useTranslations('operations.billing');
  const root = useShellBreadcrumbRoot();
  const ability = useAbility();
  const canReadInvoices = ability.can('read', 'Invoice');
  const canReadTariffs = ability.can('read', 'ServiceTariff');
  const canReadTemplates = ability.can('read', 'DocumentTemplate');
  const canReadFees = ability.can('read', 'ClinicianFee');
  const readableTabs: Record<BillingTab, boolean> = {
    invoices: canReadInvoices,
    tariffs: canReadTariffs,
    report: canReadInvoices,
    fees: canReadFees,
    templates: canReadTemplates,
  };
  const allowedTabs = BILLING_TABS.filter((tab) => readableTabs[tab]);
  const { tab, setTab } = useTabSearchParam<BillingTab>({
    allowed: allowedTabs,
    fallback: allowedTabs[0] ?? 'invoices',
    initialTab,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumbs={[root, { label: t('title') }]}
      />
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as BillingTab)}
        className="space-y-5"
      >
        <TabsList>
          {canReadInvoices ? <TabsTrigger value="invoices">{t('invoices')}</TabsTrigger> : null}
          {canReadTariffs ? <TabsTrigger value="tariffs">{t('tariffs')}</TabsTrigger> : null}
          {canReadInvoices ? <TabsTrigger value="report">{t('dailyReport')}</TabsTrigger> : null}
          {canReadFees ? <TabsTrigger value="fees">{t('fees.tab')}</TabsTrigger> : null}
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
        {canReadFees ? (
          <TabsContent value="fees">
            <ClinicianFeesPanel currentPeriod={currentPeriod} />
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
