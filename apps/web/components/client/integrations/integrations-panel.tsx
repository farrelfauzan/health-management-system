'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';

import { BpjsMappingsPanel } from '#components/client/integrations/bpjs-mappings-panel';
import { BpjsSettingsPanel } from '#components/client/integrations/bpjs-settings-panel';
import { IntegrationSubmissionMonitor } from '#components/client/integrations/integration-submission-monitor';
import { PageHeader } from '#components/shared/page-header';
import { ADMIN_ROUTE_METADATA } from '#lib/shell/route-metadata';

export function IntegrationsPanel() {
  const ability = useAbility();
  const metadata = ADMIN_ROUTE_METADATA.integrations;
  const canMonitor =
    ability.can('read', 'BpjsSubmission') || ability.can('read', 'SatusehatSubmission');
  const canConfigure = ability.can('manage', 'BpjsConfig');
  const canMap = ability.can('manage', 'BpjsMapping');
  const defaultTab = canMonitor ? 'monitor' : canConfigure ? 'settings' : 'mappings';

  return (
    <div className="space-y-6">
      <PageHeader
        title={metadata.title}
        subtitle={metadata.subtitle}
        breadcrumbs={[...metadata.breadcrumbs]}
      />
      <Tabs defaultValue={defaultTab} className="space-y-5">
        <TabsList>
          {canMonitor ? <TabsTrigger value="monitor">Monitor</TabsTrigger> : null}
          {canConfigure ? <TabsTrigger value="settings">BPJS settings</TabsTrigger> : null}
          {canMap ? <TabsTrigger value="mappings">BPJS mappings</TabsTrigger> : null}
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
