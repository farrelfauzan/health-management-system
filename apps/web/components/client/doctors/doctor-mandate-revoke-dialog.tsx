'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DoctorMandate } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import {
  doctorMandateControllerRevokeMandateV1,
  getDoctorMandateControllerListMandatesV1QueryKey,
} from '#lib/api/generated/doctor-mandates/doctor-mandates';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';

const REASON_INPUT_ID = 'revoke-doctor-mandate-reason';
const MIN_REASON_LENGTH = 3;

type DoctorMandateRevokeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mandate: DoctorMandate;
  doctorName: string;
};

/**
 * Ends one pelimpahan now, with a reason. The row stays, and so does every
 * procedure already recorded under it — what happened under a mandate does not
 * stop having happened.
 */
export function DoctorMandateRevokeDialog({
  open,
  onOpenChange,
  mandate,
  doctorName,
}: DoctorMandateRevokeDialogProps) {
  const t = useTranslations('clinical');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const revokeMutation = useMutation({
    mutationFn: () =>
      doctorMandateControllerRevokeMandateV1(mandate.midwifeDoctorId, mandate.id, {
        reason: reason.trim(),
      }),
  });

  async function handleRevoke(): Promise<void> {
    if (reason.trim().length < MIN_REASON_LENGTH) {
      setFormError(t('doctors.authorities.revokeDialog.reasonRequired'));
      return;
    }
    setFormError(null);
    try {
      parseApiSuccess<DoctorMandate>(
        await revokeMutation.mutateAsync(),
        t('doctors.mandates.revokeDialog.error'),
      );
      await queryClient.invalidateQueries({
        queryKey: getDoctorMandateControllerListMandatesV1QueryKey(mandate.midwifeDoctorId),
      });
      onOpenChange(false);
    } catch (error) {
      setFormError(notifyApiError(error, t('doctors.mandates.revokeDialog.error')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t('doctors.mandates.revokeDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('doctors.mandates.revokeDialog.description', {
              name: doctorName,
              doctor: mandate.mandatingDoctorName,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
          <div className="space-y-1.5">
            <FormLabel
              htmlFor={REASON_INPUT_ID}
              className="font-heading text-xs text-slate-600"
              required
            >
              {t('doctors.authorities.revokeDialog.reason')}
            </FormLabel>
            <Textarea
              id={REASON_INPUT_ID}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={revokeMutation.isPending}
            onClick={() => void handleRevoke()}
          >
            {revokeMutation.isPending
              ? t('doctors.authorities.revokeDialog.submitting')
              : t('doctors.authorities.revokeDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
