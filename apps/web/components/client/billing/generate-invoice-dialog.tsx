'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GenerateInvoiceInput, InvoiceDetail, InvoiceGenerationGap } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hms/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { InvoiceItemsList } from '#components/client/billing/invoice-items-list';
import { InvoiceGenerationGapList } from '#components/client/billing/invoice-generation-gap-list';
import { invoiceControllerGenerateInvoiceV1 } from '#lib/api/generated/invoices/invoices';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateBillingQueries } from '#lib/billing/invalidate-billing-queries';

type GenerateInvoiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: string;
  patientName: string;
};

export function GenerateInvoiceDialog({
  open,
  onOpenChange,
  encounterId,
  patientName,
}: GenerateInvoiceDialogProps) {
  const t = useTranslations('operations');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [gaps, setGaps] = useState<InvoiceGenerationGap[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const generateMutation = useMutation({
    mutationFn: (payload: GenerateInvoiceInput) => invoiceControllerGenerateInvoiceV1(payload),
  });

  async function handleGenerate(): Promise<void> {
    setActionError(null);
    try {
      const response = await generateMutation.mutateAsync({ encounterId });
      const envelope = parseApiSuccess<InvoiceDetail>(response, t('billing.generateError'));
      const meta = envelope.meta as { gaps?: InvoiceGenerationGap[] } | undefined;
      setInvoice(envelope.data);
      setGaps(meta?.gaps ?? []);
      await invalidateBillingQueries(queryClient);
    } catch (error) {
      setActionError(notifyApiError(error, t('billing.generateError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('billing.labels.generateInvoice')}</DialogTitle>
          <DialogDescription>
            Collects the consultation fee, tariffed procedures, and dispensed medications from this
            visit into a draft invoice for {patientName}.
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

        {invoice ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Draft <span className="font-mono font-medium">{invoice.invoiceNumber}</span> created.
            </p>
            <InvoiceItemsList items={invoice.items} totalAmount={invoice.totalAmount} />
            <InvoiceGenerationGapList gaps={gaps} />
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {invoice ? t('common.close') : t('common.cancel')}
          </Button>
          {invoice ? (
            <Button
              type="button"
              className="bg-primary-container hover:bg-primary"
              onClick={() => {
                onOpenChange(false);
                router.push('/admin/billing');
              }}
            >
              Go to Billing
            </Button>
          ) : (
            <Button
              type="button"
              className="bg-primary-container hover:bg-primary"
              disabled={generateMutation.isPending}
              onClick={() => void handleGenerate()}
            >
              {generateMutation.isPending ? 'Generating...' : 'Generate Draft'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
