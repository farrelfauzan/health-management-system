'use client';

import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PatientsDirectoryPanel } from '#components/client/patients/patients-directory-panel';
import { PatientsPageHeader } from '#components/client/patients/patients-page-header';
import { ProspectivePatientsPanel } from '#components/client/prospective-patients/prospective-patients-panel';
import { useTabSearchParam } from '#lib/navigation/use-tab-search-param';
import { PATIENTS_TABS, type PatientsTab } from '#lib/patients/patients-tabs';
import type { PatientsSearchParams } from '#lib/patients/search-params';
import { useAwaitingArrivalCount } from '#lib/prospective-patients/use-awaiting-arrival-count';

type PatientsWorkspaceProps = {
  initialQuery: PatientsSearchParams;
  /** A tab asked for by the URL (SJ-162). */
  initialTab?: PatientsTab;
};

/**
 * The admin patients page: the directory, and beside it the people who booked
 * through chat and are not patients yet (`P19-T08`).
 *
 * The second tab carries a count so the desk sees that somebody is waiting
 * without opening it. Both tabs are behind the same `patient.read` the page
 * itself needs, so the strip is not filtered by ability the way the pharmacy
 * strip is; the row actions on the chat tab are gated individually instead.
 */
export function PatientsWorkspace({ initialQuery, initialTab }: PatientsWorkspaceProps) {
  const t = useTranslations('clinical');
  const { tab, setTab } = useTabSearchParam<PatientsTab>({
    allowed: PATIENTS_TABS,
    fallback: 'directory',
    initialTab,
  });
  const awaitingCount = useAwaitingArrivalCount();

  return (
    <div className="space-y-6">
      <PatientsPageHeader />
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as PatientsTab)}
        className="space-y-5"
      >
        <TabsList>
          <TabsTrigger value="directory">{t('patients.directoryTab')}</TabsTrigger>
          <TabsTrigger value="from-chat">
            {t('patients.fromChatTab')}
            {awaitingCount.count > 0 ? (
              <Badge className="bg-amber-100 text-amber-900" data-testid="from-chat-count">
                {awaitingCount.count}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="directory">
          <PatientsDirectoryPanel initialQuery={initialQuery} />
        </TabsContent>
        <TabsContent value="from-chat">
          <ProspectivePatientsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
