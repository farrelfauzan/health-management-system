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

import { InlineNotice } from '#components/client/shared/inline-notice';
import { registrationFlowControllerUpdateRegistrationV1 } from '#lib/api/generated/registration-flow/registration-flow';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { notifyStatement } from '#lib/api/notify-statement';
import { invalidateRegistrationQueries } from '#lib/registrations/invalidate-registration-queries';
import { resolveOutsideSessionDetails } from '#lib/registrations/resolve-outside-session-details';
import { useOutsideSessionStatement } from '#lib/registrations/use-outside-session-statement';
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
  /** Sends `force: true`, for an administrator overriding the practice window. */
  isForced?: boolean;
};

export function RegistrationTransitionDialog({
  open,
  onOpenChange,
  registration,
  targetStatus,
  isForced = false,
}: RegistrationTransitionDialogProps) {
  const t = useTranslations('operations.registrations');
  const queryClient = useQueryClient();
  const buildOutsideSessionStatement = useOutsideSessionStatement();
  const [actionError, setActionError] = useState<string | null>(null);
  const meta = REGISTRATION_TRANSITION_META[targetStatus];
  const isCheckIn = targetStatus === 'CHECKED_IN';
  const confirmLabel = isCheckIn
    ? isForced
      ? t('session.checkInAnyway')
      : t('checkIn')
    : targetStatus === 'COMPLETED'
      ? t('complete')
      : t('cancel');
  const transitionMutation = useMutation({
    mutationFn: () =>
      registrationFlowControllerUpdateRegistrationV1(registration.id, {
        status: targetStatus,
        ...(isForced && isCheckIn ? { force: true } : {}),
      }),
  });

  async function handleConfirm(): Promise<void> {
    setActionError(null);
    try {
      const response = await transitionMutation.mutateAsync();
      parseApiSuccess<RegistrationListItem>(response, t('updateError'));
      await invalidateRegistrationQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      // P19-T16. A check-in outside the doctor's hours is a rule, not a
      // failure: it gets the statement the desk can act on, in their own
      // locale, rather than the English sentence the API composed for logs.
      const outsideSession = resolveOutsideSessionDetails(error);
      if (!outsideSession) {
        setActionError(notifyApiError(error, t('updateError')));
        return;
      }
      const statement = buildOutsideSessionStatement(outsideSession);
      notifyStatement({ tone: 'error', title: statement });
      setActionError(statement);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{confirmLabel}</DialogTitle>
          <DialogDescription>
            {t('transitionDescription', {
              name: registration.patient.fullName,
              from: formatStatusLabel(registration.status),
              to: formatStatusLabel(targetStatus),
            })}
          </DialogDescription>
        </DialogHeader>
        {isForced && isCheckIn ? (
          <InlineNotice tone="warning" title={t('session.overrideTitle')}>
            {t('session.overrideDescription')}
          </InlineNotice>
        ) : null}
        {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
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
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
