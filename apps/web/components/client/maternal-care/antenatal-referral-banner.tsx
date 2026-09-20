'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Icon, Input, toast } from '@hms/ui';
import type { TriggeredAntenatalReferralRule } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { antenatalExaminationControllerDismissReferralRuleV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';

type AntenatalReferralBannerProps = {
  encounterId: string;
  rules: TriggeredAntenatalReferralRule[];
  isEditable: boolean;
};

/**
 * "Perlu rujukan" (FR-ANC-04). Nothing is blocked: the banner states what
 * fired and the midwife may set it aside with a reason, which is recorded.
 *
 * A dismissed rule keeps its place in the list rather than disappearing — the
 * record is judged later, and a prompt that vanished when acknowledged would
 * leave the next reader unable to tell an oversight from a decision.
 */
export function AntenatalReferralBanner({
  encounterId,
  rules,
  isEditable,
}: AntenatalReferralBannerProps) {
  const t = useTranslations('maternalCare.examination.referral');
  const queryClient = useQueryClient();
  const [dismissingRuleCode, setDismissingRuleCode] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('');

  const mutation = useMutation({
    mutationFn: async (ruleCode: string) =>
      antenatalExaminationControllerDismissReferralRuleV1(encounterId, { ruleCode, reason }),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      setDismissingRuleCode(null);
      setReason('');
      toast.success(t('dismiss'));
    },
    onError: (error) => notifyApiError(error, t('dismiss')),
  });

  if (rules.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{t('pending')}</p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-warning bg-warning-tint px-3 py-2">
      <p className="flex items-center gap-2 text-sm font-medium text-warning">
        <Icon name="warning" size={16} />
        {t('title')}
      </p>
      <ul className="space-y-2">
        {rules.map((rule) => (
          <li key={rule.code} className="text-sm text-slate-900">
            <span className="font-medium">{rule.label}</span>
            <span className="ml-2 text-xs text-slate-500">
              {t('source')}: {rule.source}
            </span>
            {rule.dismissedReason === null ? null : (
              <p className="text-xs text-slate-600">
                {t('dismissed', { reason: rule.dismissedReason })}
              </p>
            )}
            {isEditable && rule.dismissedReason === null ? (
              dismissingRuleCode === rule.code ? (
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    aria-label={t('reasonLabel')}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={reason.trim().length === 0 || mutation.isPending}
                    onClick={() => mutation.mutate(rule.code)}
                  >
                    {t('confirmDismiss')}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDismissingRuleCode(rule.code)}
                >
                  {t('dismiss')}
                </Button>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
