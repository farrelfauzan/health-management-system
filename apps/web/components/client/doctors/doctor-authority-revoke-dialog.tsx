'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DoctorAuthority } from '@hms/shared-types';
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
  doctorAuthorityControllerRevokeAuthorityV1,
  getDoctorAuthorityControllerListAuthoritiesV1QueryKey,
} from '#lib/api/generated/doctor-authorities/doctor-authorities';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';

const REASON_INPUT_ID = 'revoke-doctor-authority-reason';
const MIN_REASON_LENGTH = 3;

type DoctorAuthorityRevokeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authority: DoctorAuthority;
  doctorName: string;
};

/** Ends one authority now, with a reason. The row stays for the audit trail. */
export function DoctorAuthorityRevokeDialog({
  open,
  onOpenChange,
  authority,
  doctorName,
}: DoctorAuthorityRevokeDialogProps) {
  const t = useTranslations('clinical');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const revokeMutation = useMutation({
    mutationFn: () =>
      doctorAuthorityControllerRevokeAuthorityV1(authority.doctorId, authority.id, {
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
      parseApiSuccess<DoctorAuthority>(
        await revokeMutation.mutateAsync(),
        t('doctors.authorities.revokeDialog.error'),
      );
      await queryClient.invalidateQueries({
        queryKey: getDoctorAuthorityControllerListAuthoritiesV1QueryKey(authority.doctorId),
      });
      onOpenChange(false);
    } catch (error) {
      setFormError(notifyApiError(error, t('doctors.authorities.revokeDialog.error')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t('doctors.authorities.revokeDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('doctors.authorities.revokeDialog.description', {
              name: doctorName,
              kind: t(`doctors.authorities.kind.${authority.kind}`),
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
