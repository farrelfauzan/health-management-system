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

const TRANSITION_ERROR_FALLBACK = 'Unable to update the encounter. Please try again.';

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
      parseApiSuccess<EncounterDetail>(response, TRANSITION_ERROR_FALLBACK);
      await invalidateEncounterQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setActionError(notifyApiError(error, TRANSITION_ERROR_FALLBACK));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{meta.title}</DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>
        {targetStatus === 'FINISHED' && !hasPrimaryDiagnosis ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This encounter has no primary diagnosis. It will close, but the BPJS kunjungan cannot be
            submitted without one.
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
            Keep Open
          </Button>
          <Button
            type="button"
            disabled={transitionMutation.isPending}
            variant={meta.isDestructive ? 'destructive' : 'default'}
            className={meta.isDestructive ? undefined : 'bg-primary-container hover:bg-primary'}
            onClick={() => void handleConfirm()}
          >
            {transitionMutation.isPending ? meta.pendingLabel : meta.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
