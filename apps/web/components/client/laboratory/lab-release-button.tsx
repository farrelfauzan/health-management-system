'use client';

import { useState } from 'react';
import type { LabOrderBenchView, LaboratorySettingsView } from '@hms/shared-types';
import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabReleaseDialog } from '#components/client/laboratory/lab-release-dialog';

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
 * click. The click itself opens the release dialog (`P18-T14`), where the
 * verifier may add the one sentence the sheet prints under its results.
 */
export function LabReleaseButton({
  bench,
  settings,
  canVerify,
  currentUserId,
  isTechnicianOnly,
}: LabReleaseButtonProps) {
  const t = useTranslations('operations.laboratory.validation');
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);

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

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {blocker ? <span className="text-xs text-slate-600">{blocker}</span> : null}
      {settings?.singleOperator ? (
        <span className="text-xs text-slate-500">{t('singleOperator')}</span>
      ) : null}
      <Button
        type="button"
        onClick={() => setIsDialogOpen(true)}
        disabled={blocker !== null}
        data-testid="lab-release-button"
      >
        <Icon name="verified" size={16} />
        {t('release')}
      </Button>
      <LabReleaseDialog
        labOrderId={bench.order.id}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </div>
  );
}
