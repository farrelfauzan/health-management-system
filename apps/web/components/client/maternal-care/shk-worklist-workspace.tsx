'use client';

import { useState } from 'react';
import type { ShkScreeningView } from '@hms/shared-types';
import { Tabs, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RecordShkStepDialog } from '#components/client/maternal-care/record-shk-step-dialog';
import { ShkWorklistTable } from '#components/client/maternal-care/shk-worklist-table';
import { useTabSearchParam } from '#lib/navigation/use-tab-search-param';
import type { ShkRowAction } from '#lib/maternal-care/shk-row-action';
import { SHK_WORKLIST_TABS, type ShkWorklistTab } from '#lib/maternal-care/shk-worklist-tabs';
import { useShkWorklist } from '#lib/maternal-care/use-shk-worklist';

type ShkWorklistWorkspaceProps = {
  initialTab: ShkWorklistTab;
  /** `/doctor/patients` or `/admin/patients`: where a baby's row links to. */
  patientDetailBasePath: string;
};

type ShkStepTarget = {
  action: ShkRowAction;
  screening: ShkScreeningView;
};

/**
 * The SHK sample worklist (P25-T10): who is due for the heel prick, who is
 * late, whose card is waiting on the laboratory, and who was recalled. The tab
 * lives in the URL so a notification or a bookmark lands on the right one.
 */
export function ShkWorklistWorkspace({
  initialTab,
  patientDetailBasePath,
}: ShkWorklistWorkspaceProps) {
  const t = useTranslations('maternalCare.shk');
  const ability = useAbility();
  const { tab, setTab } = useTabSearchParam<ShkWorklistTab>({
    key: 'status',
    allowed: SHK_WORKLIST_TABS,
    fallback: 'DUE',
    initialTab,
  });
  const [target, setTarget] = useState<ShkStepTarget | null>(null);
  const worklist = useShkWorklist(tab);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as ShkWorklistTab)}>
        <TabsList>
          {SHK_WORKLIST_TABS.map((option) => (
            <TabsTrigger key={option} value={option}>
              {t(`tabs.${option}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <ShkWorklistTable
        items={worklist.items}
        isPending={worklist.isPending}
        isError={worklist.isError}
        patientDetailBasePath={patientDetailBasePath}
        canWrite={ability.can('write', 'Encounter')}
        onAction={(action, screening) => setTarget({ action, screening })}
      />
      {target === null ? null : (
        <RecordShkStepDialog
          key={`${target.screening.id}-${target.action}`}
          screening={target.screening}
          action={target.action}
          onOpenChange={(open) => {
            if (!open) {
              setTarget(null);
            }
          }}
        />
      )}
    </div>
  );
}
