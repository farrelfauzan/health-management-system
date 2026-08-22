'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AdmissionResponse,
  AdmissionRoomChargeResult,
  DischargeAdmissionInput,
} from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { admissionFlowControllerDischargeAdmissionV1 } from '#lib/api/generated/admission-flow/admission-flow';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAdmissionQueries } from '#lib/admissions/invalidate-admission-queries';

type DischargeAdmissionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admission: AdmissionResponse;
};

export function DischargeAdmissionDialog({
  open,
  onOpenChange,
  admission,
}: DischargeAdmissionDialogProps) {
  const t = useTranslations('operations');
  const queryClient = useQueryClient();
  const [dischargeSummary, setDischargeSummary] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const dischargeMutation = useMutation({
    mutationFn: (payload: DischargeAdmissionInput) =>
      admissionFlowControllerDischargeAdmissionV1(admission.id, payload),
  });

  /**
   * Discharging raises the accommodation invoice (IMP-15), and the API reports
   * an unpriced ward class as a gap rather than refusing. Saying so here is
   * what keeps that gap from being silent — the patient still goes home, but
   * somebody has to know the nights went unbilled.
   */
  function announceRoomCharge(roomCharge: AdmissionRoomChargeResult | undefined): void {
    if (!roomCharge) {
      return;
    }
    if (roomCharge.gaps.length > 0) {
      toast.warning(t('admissions.roomChargeGaps'));
      return;
    }
    if (!roomCharge.invoiceNumber) {
      toast.info(t('admissions.roomChargeNone'));
      return;
    }
    toast.success(
      t('admissions.roomChargeRaised', {
        nights: roomCharge.nights,
        invoiceNumber: roomCharge.invoiceNumber,
      }),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);

    try {
      const envelope = parseApiSuccess<AdmissionResponse>(
        await dischargeMutation.mutateAsync(
          dischargeSummary.trim() ? { dischargeSummary: dischargeSummary.trim() } : {},
        ),
        t('admissions.dischargeError'),
      );
      announceRoomCharge(
        (envelope.meta as { roomCharge?: AdmissionRoomChargeResult } | undefined)?.roomCharge,
      );
      await invalidateAdmissionQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setActionError(notifyApiError(error, t('admissions.dischargeError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('admissions.discharge')}</DialogTitle>
          <DialogDescription>{admission.patient.fullName}</DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="discharge-summary">{t('admissions.dischargeSummary')}</Label>
            <Textarea
              id="discharge-summary"
              rows={4}
              value={dischargeSummary}
              onChange={(event) => setDischargeSummary(event.target.value)}
            />
          </div>
          {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={dischargeMutation.isPending}>
              {dischargeMutation.isPending ? t('common.saving') : t('admissions.discharge')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
