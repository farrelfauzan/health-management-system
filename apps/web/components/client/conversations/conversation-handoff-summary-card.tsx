'use client';

import { Card, CardContent } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { useConversationHandoffSummary } from '#lib/conversations/use-conversation-handoff-summary';

/**
 * The handoff queue's notification affordance on the inbox itself.
 *
 * The nav badge tells an admin *that* something is waiting from anywhere in
 * the app; this card tells them how bad it is once they are here, which is a
 * different question and the one that decides whether they open the oldest
 * conversation or the newest. `oldestWaitingSince` is the whole reason it is a
 * card rather than a number: three customers waiting two minutes and one
 * waiting forty are very different afternoons and the same count.
 */
export function ConversationHandoffSummaryCard() {
  const t = useTranslations('conversations.summary');
  const format = useFormatter();
  const { summary } = useConversationHandoffSummary(true);

  if (summary === undefined) {
    return null;
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-8 p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{t('needsHuman')}</p>
          <p className="text-2xl font-semibold text-amber-800">{summary.needsHumanCount}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{t('humanActive')}</p>
          <p className="text-2xl font-semibold text-emerald-800">{summary.humanActiveCount}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{t('oldestWaiting')}</p>
          <p className="text-sm font-medium text-slate-700">
            {summary.oldestWaitingSince === null
              ? t('nobodyWaiting')
              : format.dateTime(new Date(summary.oldestWaitingSince), {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
