'use client';

import type { FamilyPlanningDeliveryCandidateView } from '@hms/shared-types';
import { Button, Icon } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

type FamilyPlanningPostDeliveryPromptProps = {
  candidate: FamilyPlanningDeliveryCandidateView;
  onStart: (deliveryRecordId: string) => void;
};

/**
 * A birth of the last 42 days with no KB course yet (P25-T14). Offered here as
 * well as on the delivery section because a recorded birth ends the pregnancy,
 * and the Kehamilan tab stops showing it once it has.
 */
export function FamilyPlanningPostDeliveryPrompt({
  candidate,
  onStart,
}: FamilyPlanningPostDeliveryPromptProps) {
  const t = useTranslations();
  const format = useFormatter();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-slate-900">
          {t('maternalCare.familyPlanning.postDeliveryPrompt.title', {
            date: format.dateTime(new Date(candidate.birthAt), { dateStyle: 'medium' }),
          })}
        </p>
        <p className="text-xs text-slate-500">
          {t('maternalCare.familyPlanning.postDeliveryPrompt.description')}
        </p>
      </div>
      <Button type="button" size="sm" onClick={() => onStart(candidate.deliveryRecordId)}>
        <Icon name="add" size={16} />
        {t('maternalCare.familyPlanning.actions.startPostDelivery')}
      </Button>
    </div>
  );
}
