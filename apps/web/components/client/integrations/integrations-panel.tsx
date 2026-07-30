'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

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
      <Tabs defaultValue={defaultTab} className="space-y-5">
        <TabsList>
          {canMonitor ? <TabsTrigger value="monitor">{t('monitor')}</TabsTrigger> : null}
          {canConfigure ? <TabsTrigger value="settings">{t('settings')}</TabsTrigger> : null}
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
        {canMap ? (
          <TabsContent value="mappings">
            <BpjsMappingsPanel />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
