'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LabOrderBenchView, LaboratorySettingsView } from '@hms/shared-types';
import { Button, Icon, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { labResultControllerReleaseLabOrderV1 } from '#lib/api/generated/laboratory-results/laboratory-results';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateLabQueries } from '#lib/laboratory/invalidate-lab-queries';

type LabReleaseButtonProps = {
  bench: LabOrderBenchView;
  settings: LaboratorySettingsView | undefined;
  canVerify: boolean;
  currentUserId: string | null;
  isTechnicianOnly: boolean;
};

/**
 * The second signature (`P18-T04`, `P18-T08`). Rendered only for
 * `lab-result.verify`, and *explained* when it cannot be pressed: a test still
 * without a value, a value the viewer typed themselves under the two-operator
 * rule, a clinic that keeps release to doctors. Every one of those is also
 * refused by the API on the click; this is the sentence that saves the
 * click.
 */
export function LabReleaseButton({
  bench,
  settings,
  canVerify,
  currentUserId,
  isTechnicianOnly,
}: LabReleaseButtonProps) {
  const t = useTranslations('operations.laboratory.validation');
  const queryClient = useQueryClient();
  const releaseMutation = useMutation({
    mutationFn: () => labResultControllerReleaseLabOrderV1(bench.order.id),
  });

  if (!canVerify || bench.order.status === 'RELEASED') {
    return null;
  }

  const pendingCount = bench.order.items.filter((item) => item.status === 'PENDING').length;
  const isOwnEntry =
    settings !== undefined &&
    !settings.singleOperator &&
    currentUserId !== null &&
    bench.results.some((result) => result.enteredById === currentUserId);
  const isTechnicianBlocked =
    isTechnicianOnly && settings !== undefined && !settings.technicianMayVerify;
  const blocker =
    pendingCount > 0
      ? t('waiting', { count: pendingCount })
      : isTechnicianBlocked
        ? t('technicianBlocked')
        : isOwnEntry
          ? t('ownEntry')
          : null;

  async function handleRelease(): Promise<void> {
    try {
      parseApiSuccess(await releaseMutation.mutateAsync(), t('releaseError'));
      toast.success(t('released'));
      await invalidateLabQueries(queryClient);
    } catch (caughtError) {
      notifyApiError(caughtError, t('releaseError'));
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {blocker ? <span className="text-xs text-slate-600">{blocker}</span> : null}
      {settings?.singleOperator ? (
        <span className="text-xs text-slate-500">{t('singleOperator')}</span>
      ) : null}
      <Button
        type="button"
        onClick={handleRelease}
        disabled={blocker !== null || releaseMutation.isPending}
        data-testid="lab-release-button"
      >
        <Icon name="verified" size={16} />
        {releaseMutation.isPending ? t('releasing') : t('release')}
      </Button>
    </div>
  );
}
