'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LabReportVersionView } from '@hms/shared-types';
import { Button, Icon, toast, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { labReportControllerRetryReportV1 } from '#lib/api/generated/laboratory-orders/laboratory-orders';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateLabQueries } from '#lib/laboratory/invalidate-lab-queries';

type LabReportRetryButtonProps = {
  labOrderId: string;
  version: LabReportVersionView;
};

/**
 * Asks for one more go at a render (`P18-T05`).
 *
 * The worker retries on its own, but only within its attempt budget: after the
 * last one the version settles FAILED and nothing re-opens it. Most of those
 * failures are a setting somebody can fix in a minute — a clinic profile that
 * was never filled in — and without this the only way back was a hand-written
 * UPDATE.
 *
 * Offered on a version still backing off too, which pulls its next attempt
 * forward: the patient is at the counter now, not in eight minutes.
 */
export function LabReportRetryButton({ labOrderId, version }: LabReportRetryButtonProps) {
  const t = useTranslations('operations.laboratory.reports');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const retryMutation = useMutation({
    mutationFn: () => labReportControllerRetryReportV1(labOrderId, version.id),
  });

  if (version.status === 'READY' || !ability.can('write', 'LabOrder')) {
    return null;
  }

  async function handleRetry(): Promise<void> {
    try {
      await retryMutation.mutateAsync();
      await invalidateLabQueries(queryClient);
      toast.success(t('retried'));
    } catch (caughtError) {
      notifyApiError(caughtError, t('retryError'));
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={retryMutation.isPending}
      onClick={() => void handleRetry()}
    >
      <Icon name="refresh" size={15} />
      {retryMutation.isPending ? t('retrying') : t('retry')}
    </Button>
  );
}
