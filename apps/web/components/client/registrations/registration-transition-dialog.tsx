'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RegistrationListItem } from '@hms/shared-types';
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

import { registrationFlowControllerUpdateRegistrationV1 } from '#lib/api/generated/registration-flow/registration-flow';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateRegistrationQueries } from '#lib/registrations/invalidate-registration-queries';
import {
  REGISTRATION_TRANSITION_META,
  type RegistrationTransitionTarget,
} from '#lib/registrations/registration-transition-meta';
import { formatStatusLabel } from '#lib/shared/status-label';

type RegistrationTransitionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registration: RegistrationListItem;
  targetStatus: RegistrationTransitionTarget;
};

export function RegistrationTransitionDialog({
  open,
  onOpenChange,
  registration,
  targetStatus,
}: RegistrationTransitionDialogProps) {
  const t = useTranslations('operations.registrations');
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const meta = REGISTRATION_TRANSITION_META[targetStatus];
  const transitionMutation = useMutation({
    mutationFn: () =>
      registrationFlowControllerUpdateRegistrationV1(registration.id, { status: targetStatus }),
  });

  async function handleConfirm(): Promise<void> {
    setActionError(null);
    try {
      const response = await transitionMutation.mutateAsync();
      parseApiSuccess<RegistrationListItem>(response, t('updateError'));
      await invalidateRegistrationQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setActionError(notifyApiError(error, t('updateError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {targetStatus === 'CHECKED_IN'
              ? t('checkIn')
              : targetStatus === 'COMPLETED'
                ? t('complete')
                : t('cancel')}
          </DialogTitle>
          <DialogDescription>
            {t('transitionDescription', {
              name: registration.patient.fullName,
              from: formatStatusLabel(registration.status),
              to: formatStatusLabel(targetStatus),
            })}
          </DialogDescription>
        </DialogHeader>
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
            {t('keepStatus')}
          </Button>
          <Button
            type="button"
            disabled={transitionMutation.isPending}
            variant={meta.isDestructive ? 'destructive' : 'default'}
            className={meta.isDestructive ? undefined : 'bg-primary-container hover:bg-primary'}
            onClick={() => void handleConfirm()}
          >
            {targetStatus === 'CHECKED_IN'
              ? t('checkIn')
              : targetStatus === 'COMPLETED'
                ? t('complete')
                : t('cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
