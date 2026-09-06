'use client';

import type { PatientDocumentView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PatientDocumentDeliveryRow } from '#components/client/patient-documents/patient-document-delivery-row';
import { usePatientDocumentDeliveries } from '#lib/patient-documents/use-patient-document-deliveries';

type PatientDocumentDeliveriesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: PatientDocumentView;
};

/**
 * The delivery timeline of one released clinical file (`P16-T40`, FR-E4-14):
 * the same rows, statuses and last-error codes as an invoice's — one table,
 * one worker, one timeline (D-028). Read-only here: retry, revoke and
 * cancel are cashier verbs behind `invoice.deliver`, and a clinician who
 * wants a result re-sent releases it again from the row.
 */
export function PatientDocumentDeliveriesDialog({
  open,
  onOpenChange,
  document,
}: PatientDocumentDeliveriesDialogProps) {
  const t = useTranslations('clinical.patients.documents.deliveries');
  const query = usePatientDocumentDeliveries(document.id, open);
  const deliveries = query.timeline?.deliveries ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title', { title: document.title })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {query.isPending ? <Skeleton className="h-16 w-full" /> : null}
        {query.isError ? (
          <p role="alert" className="text-sm text-rose-700">
            {t('loadError')}
          </p>
        ) : null}
        {!query.isPending && !query.isError && deliveries.length === 0 ? (
          <p className="text-sm text-slate-500">{t('empty')}</p>
        ) : null}
        {deliveries.length > 0 ? (
          <ul className="space-y-2">
            {deliveries.map((delivery) => (
              <PatientDocumentDeliveryRow key={delivery.id} delivery={delivery} />
            ))}
          </ul>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
