'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TelegramWebhookCard } from '#components/client/channel-gateway/telegram-webhook-card';
import { WhatsappSessionCard } from '#components/client/channel-gateway/whatsapp-session-card';
import { BpjsAntreanSettingsPanel } from '#components/client/integrations/bpjs-antrean-settings-panel';
import { BpjsMappingsPanel } from '#components/client/integrations/bpjs-mappings-panel';
import { BpjsSettingsPanel } from '#components/client/integrations/bpjs-settings-panel';
import { IntegrationSubmissionMonitor } from '#components/client/integrations/integration-submission-monitor';
import { PageHeader } from '#components/shared/page-header';

export function IntegrationsPanel() {
  const t = useTranslations('operations.integrations');
  const ability = useAbility();
  const canMonitor =
    ability.can('read', 'BpjsSubmission') || ability.can('read', 'SatusehatSubmission');
  const canConfigure = ability.can('manage', 'BpjsConfig');
  const canMap = ability.can('manage', 'BpjsMapping');
  const defaultTab = canMonitor ? 'monitor' : canConfigure ? 'settings' : 'mappings';

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} breadcrumbs={[t('title')]} />
      {/* Above the tabs rather than inside one, because both of these fail
          silently (§8.4) and a warning behind a tab is a warning nobody sees.
          A logged-out WhatsApp session and a webhook pointed at another
          deployment are the same class of fault: the API keeps working and no
          customer hears back. Both render nothing while loading and nothing
          for an admin without the config grant. */}
      {canConfigure ? <WhatsappSessionCard /> : null}
      {canConfigure ? <TelegramWebhookCard /> : null}
      <Tabs defaultValue={defaultTab} className="space-y-5">
        <TabsList>
          {canMonitor ? <TabsTrigger value="monitor">{t('monitor')}</TabsTrigger> : null}
          {canConfigure ? <TabsTrigger value="settings">{t('settings')}</TabsTrigger> : null}
          {canConfigure ? <TabsTrigger value="antrean">{t('antrean.tab')}</TabsTrigger> : null}
          {canMap ? <TabsTrigger value="mappings">{t('mappings')}</TabsTrigger> : null}
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
        {canMap ? (
          <TabsContent value="mappings">
            <BpjsMappingsPanel />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
