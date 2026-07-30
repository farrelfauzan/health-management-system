'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EncounterDetail } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import {
  encounterControllerCancelEncounterV1,
  encounterControllerCloseEncounterV1,
} from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import {
  ENCOUNTER_TRANSITION_META,
  type EncounterTransitionTarget,
} from '#lib/encounters/encounter-transition-meta';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';

type EncounterTransitionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounter: EncounterDetail;
  targetStatus: EncounterTransitionTarget;
};

export function EncounterTransitionDialog({
  open,
  onOpenChange,
  encounter,
  targetStatus,
}: EncounterTransitionDialogProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [actionError, setActionError] = useState<string | null>(null);
  const meta = ENCOUNTER_TRANSITION_META[targetStatus];
  const hasPrimaryDiagnosis = encounter.diagnoses.some((diagnosis) => diagnosis.type === 'PRIMARY');
  const transitionMutation = useMutation({
    mutationFn: () =>
      targetStatus === 'FINISHED'
        ? encounterControllerCloseEncounterV1(encounter.id)
        : encounterControllerCancelEncounterV1(encounter.id),
  });

  async function handleConfirm(): Promise<void> {
    setActionError(null);
    try {
      const response = await transitionMutation.mutateAsync();
      parseApiSuccess<EncounterDetail>(response, t('encounters.transition.error'));
      await invalidateEncounterQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setActionError(notifyApiError(error, t('encounters.transition.error')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t(`encounters.transition.${targetStatus}.title`)}
          </DialogTitle>
          <DialogDescription>
            {t(`encounters.transition.${targetStatus}.description`)}
          </DialogDescription>
        </DialogHeader>
        {targetStatus === 'FINISHED' && !hasPrimaryDiagnosis ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {t('encounters.transition.primaryWarning')}
          </p>
        ) : null}
        {actionError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {actionError}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('encounters.transition.keepOpen')}
          </Button>
          <Button
            type="button"
            disabled={transitionMutation.isPending}
            variant={meta.isDestructive ? 'destructive' : 'default'}
            className={meta.isDestructive ? undefined : 'bg-primary-container hover:bg-primary'}
            onClick={() => void handleConfirm()}
          >
            {t(
              `encounters.transition.${targetStatus}.${transitionMutation.isPending ? 'pending' : 'action'}`,
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
