'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TelegramWebhookCard } from '#components/client/channel-gateway/telegram-webhook-card';
import { WhatsappSessionCard } from '#components/client/channel-gateway/whatsapp-session-card';
import { BpjsAntreanSettingsPanel } from '#components/client/integrations/bpjs-antrean-settings-panel';
import { BpjsMappingsPanel } from '#components/client/integrations/bpjs-mappings-panel';
import { BpjsSettingsPanel } from '#components/client/integrations/bpjs-settings-panel';
import { IntegrationSubmissionMonitor } from '#components/client/integrations/integration-submission-monitor';
import { NonCapitationPanel } from '#components/client/integrations/non-capitation-panel';
import { NotionConnectorCard } from '#components/client/integrations/notion-connector-card';
import { SatusehatEnvironmentCard } from '#components/client/integrations/satusehat-environment-card';
import { SatusehatLocationsPanel } from '#components/client/integrations/satusehat-locations-panel';
import { PageHeader } from '#components/shared/page-header';
import { INTEGRATIONS_TABS, type IntegrationsTab } from '#lib/integrations/integrations-tabs';
import { useShellBreadcrumbRoot } from '#lib/navigation/use-shell-breadcrumb-root';
import { useTabSearchParam } from '#lib/navigation/use-tab-search-param';

type IntegrationsPanelProps = {
  /** A tab asked for by the URL; honoured only when this person may see it (SJ-162). */
  initialTab?: IntegrationsTab;
  /** The month the non-capitation recap opens on, resolved on the server (P25-T16). */
  nonCapitationMonth: string;
};

export function IntegrationsPanel({ initialTab, nonCapitationMonth }: IntegrationsPanelProps) {
  const t = useTranslations('operations.integrations');
  const root = useShellBreadcrumbRoot();
  const ability = useAbility();
  const canMonitor =
    ability.can('read', 'BpjsSubmission') || ability.can('read', 'SatusehatSubmission');
  const canConfigure = ability.can('manage', 'BpjsConfig');
  const canMap = ability.can('manage', 'BpjsMapping');
  const canReadLocations = ability.can('read', 'SatusehatLocation');
  const canSeeNotionConnector = ability.can('manage', 'NotionConnector');
  const canReadNonCapitation = ability.can('read', 'BpjsNonCapitation');
  const readableTabs: Record<IntegrationsTab, boolean> = {
    monitor: canMonitor,
    settings: canConfigure,
    antrean: canConfigure,
    'non-capitation': canReadNonCapitation,
    mappings: canMap,
    locations: canReadLocations,
  };
  const { tab, setTab } = useTabSearchParam<IntegrationsTab>({
    allowed: INTEGRATIONS_TABS.filter((candidate) => readableTabs[candidate]),
    fallback: canMonitor
      ? 'monitor'
      : canConfigure
        ? 'settings'
        : canMap
          ? 'mappings'
          : canReadNonCapitation
            ? 'non-capitation'
            : 'locations',
    initialTab,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumbs={[root, { label: t('title') }]}
      />
      {/* Above the tabs rather than inside one, because both of these fail
          silently (§8.4) and a warning behind a tab is a warning nobody sees.
          A logged-out WhatsApp session and a webhook pointed at another
          deployment are the same class of fault: the API keeps working and no
          customer hears back. Both render nothing while loading and nothing
          for an admin without the config grant. */}
      {canConfigure ? <WhatsappSessionCard /> : null}
      {canConfigure ? <TelegramWebhookCard /> : null}
      {/* Above the tabs for the same reason as the two above it: it reports a
          fault that is otherwise silent — a renamed Bug Board column stops
          every bug report with nothing anywhere saying so. Unlike them it is
          not a clinic surface at all, which is why it hangs off its own grant
          rather than the BPJS config one. */}
      {canSeeNotionConnector ? <NotionConnectorCard /> : null}
      {/* P21-T06. Above the tabs because it changes what the rows below it
          mean: a green SUBMITTED against the shared sandbox proves the
          integration works and proves nothing to the patient, whose SATUSEHAT
          Mobile reads production only. Gated on the same grant as the monitor,
          since it is only meaningful next to those rows. */}
      {ability.can('read', 'SatusehatSubmission') ? <SatusehatEnvironmentCard /> : null}
      {/* P23-T05. Somebody whose only grant here is the Notion connector has
          no readable tab, and an empty tab strip reads as a broken page rather
          than as "nothing for you in here". */}
      {canMonitor || canConfigure || canMap || canReadLocations || canReadNonCapitation ? (
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as IntegrationsTab)}
        className="space-y-5"
      >
        <TabsList>
          {canMonitor ? <TabsTrigger value="monitor">{t('monitor')}</TabsTrigger> : null}
          {canConfigure ? <TabsTrigger value="settings">{t('settings')}</TabsTrigger> : null}
          {canConfigure ? <TabsTrigger value="antrean">{t('antrean.tab')}</TabsTrigger> : null}
          {canReadNonCapitation ? (
            <TabsTrigger value="non-capitation">{t('nonCapitation.tab')}</TabsTrigger>
          ) : null}
          {canMap ? <TabsTrigger value="mappings">{t('mappings')}</TabsTrigger> : null}
          {canReadLocations ? (
            <TabsTrigger value="locations">{t('satusehatLocations.tab')}</TabsTrigger>
          ) : null}
        </TabsList>
        {canMonitor ? (
          <TabsContent value="monitor">
            <IntegrationSubmissionMonitor />
          </TabsContent>
        ) : null}
        {canConfigure ? (
          <TabsContent value="settings">
            <BpjsSettingsPanel />
          </TabsContent>
        ) : null}
        {canConfigure ? (
          <TabsContent value="antrean">
            <BpjsAntreanSettingsPanel />
          </TabsContent>
        ) : null}
        {canReadNonCapitation ? (
          <TabsContent value="non-capitation">
            <NonCapitationPanel initialMonth={nonCapitationMonth} />
          </TabsContent>
        ) : null}
        {canMap ? (
          <TabsContent value="mappings">
            <BpjsMappingsPanel />
          </TabsContent>
        ) : null}
        {/* P24-T06. Next to the BPJS mappings: both say how the clinic's own
            records map onto a national system before anything is sent. */}
        {canReadLocations ? (
          <TabsContent value="locations">
            <SatusehatLocationsPanel />
          </TabsContent>
        ) : null}
      </Tabs>
      ) : null}
    </div>
  );
}
