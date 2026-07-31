'use client';

import { Card, CardContent, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

type AssistantUnavailableNoticeProps = {
  isEnabled: boolean;
};

/**
 * Shown instead of the composer when chat cannot answer. The two reasons get
 * different copy on purpose: "switched off for this clinic" is a decision an
 * admin made, while "no provider configured" is a task someone still has to
 * do — telling a user the first when the truth is the second sends them to
 * the wrong person.
 */
export function AssistantUnavailableNotice({ isEnabled }: AssistantUnavailableNoticeProps) {
  const t = useTranslations('aiAssistant.unavailable');

  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-6">
        <Icon name="info" size={20} className="mt-0.5 shrink-0 text-slate-500" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-900">{t('title')}</p>
          <p className="text-sm text-slate-600">
            {isEnabled ? t('noProvider') : t('disabled')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
