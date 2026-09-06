'use client';

import { useEffect, useState } from 'react';
import type {
  DeliveryChannelValue,
  PatientDocumentReleaseView,
  PatientDocumentView,
} from '@hms/shared-types';
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

import { ReleaseDispatchOptions } from '#components/client/patient-documents/release-dispatch-options';
import { usePatientDeliveryConsents } from '#lib/document-delivery/use-patient-delivery-consents';
import { usePatientDocumentDeliveries } from '#lib/patient-documents/use-patient-document-deliveries';
import { useReleaseDocument } from '#lib/patient-documents/use-release-document';

type ReleaseDocumentDialogProps = {
  patientId: string;
  document: PatientDocumentView;
  onOpenChange: (open: boolean) => void;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

/**
 * The release confirmation with its dispatch options (`P16-T40`, §7.4.5).
 * Mounted only while open, so the readiness and timeline reads happen when
 * the clinician is deciding and not for every row in a list.
 *
 * Channels are pre-judged from the patient's readiness and pre-ticked when
 * the document's category dispatches by default (FR-E4-28) — once, when
 * the default first arrives, so a channel the clinician unticked never
 * comes back on a refetch. A refused channel never fails the release: the
 * result message says what was released, what was queued, what was not
 * sent and why, and whether the attending doctor was told.
 */
export function ReleaseDocumentDialog({
  patientId,
  document,
  onOpenChange,
  onResult,
  onError,
}: ReleaseDocumentDialogProps) {
  const t = useTranslations('clinical.patients.documents.release');
  const tChannels = useTranslations('clinical.deliveryConsent.channels');
  const tRefusals = useTranslations('clinical.deliveryConsent.refusals');
  const [channels, setChannels] = useState<DeliveryChannelValue[]>([]);
  const [hasAppliedDefault, setHasAppliedDefault] = useState(false);
  const readinessQuery = usePatientDeliveryConsents(patientId);
  const timelineQuery = usePatientDocumentDeliveries(document.id);
  const readiness = readinessQuery.consents?.channels ?? [];
  const isDispatchByDefault = timelineQuery.timeline?.isDispatchByDefault ?? false;
  const releaseMutation = useReleaseDocument({
    patientId,
    errorMessage: t('error'),
    onError,
    onSuccess: (result) => {
      onOpenChange(false);
      onResult(describeResult(result));
    },
  });

  useEffect(() => {
    if (hasAppliedDefault || !isDispatchByDefault || readiness.length === 0) {
      return;
    }
    setChannels(readiness.filter((entry) => entry.isDeliveryAllowed).map((entry) => entry.channel));
    setHasAppliedDefault(true);
  }, [hasAppliedDefault, isDispatchByDefault, readiness]);

  function describeResult(result: PatientDocumentReleaseView): string {
    const parts: string[] = [];
    if (result.deliveries.length > 0) {
      parts.push(
        t('releasedAndSent', {
          channels: result.deliveries.map((delivery) => tChannels(delivery.channel)).join(', '),
        }),
      );
    } else if (result.refusedChannels.length === 0) {
      parts.push(t('released'));
    }
    if (result.refusedChannels.length > 0) {
      parts.push(
        t('releasedNotSent', {
          reasons: result.refusedChannels
            .map((refusal) =>
              t('refusedChannel', {
                channel: tChannels(refusal.channel),
                reason: tRefusals(refusal.refusalReason),
              }),
            )
            .join('; '),
        }),
      );
    }
    if (result.isDoctorNotified) {
      parts.push(t('doctorNotified'));
    }
    return parts.join(' ');
  }

  function toggleChannel(channel: DeliveryChannelValue, isChecked: boolean): void {
    setChannels((current) =>
      isChecked
        ? [...current.filter((entry) => entry !== channel), channel]
        : current.filter((entry) => entry !== channel),
    );
  }

  function handleConfirm(): void {
    releaseMutation.mutate({
      documentId: document.id,
      input: channels.length === 0 ? {} : { dispatch: { channels } },
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('confirmTitle')}</DialogTitle>
          <DialogDescription>{t('confirmBody', { title: document.title })}</DialogDescription>
        </DialogHeader>
        <ReleaseDispatchOptions
          readiness={readiness}
          isPending={readinessQuery.isPending || timelineQuery.isPending}
          isError={readinessQuery.isError}
          isDispatchByDefault={isDispatchByDefault}
          selectedChannels={channels}
          isDisabled={releaseMutation.isPending}
          onToggleChannel={toggleChannel}
        />
        <p className="text-sm text-slate-500">{t('noUndo')}</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="button" disabled={releaseMutation.isPending} onClick={handleConfirm}>
            {releaseMutation.isPending ? t('releasing') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
