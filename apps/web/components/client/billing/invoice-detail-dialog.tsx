'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InvoiceDetail } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InvoiceItemsList } from '#components/client/billing/invoice-items-list';
import { InvoicePaymentSummary } from '#components/client/billing/invoice-payment-summary';
import { RecordPaymentForm } from '#components/client/billing/record-payment-form';
import { VoidInvoiceForm } from '#components/client/billing/void-invoice-form';
import { StatusBadge } from '#components/shared/status-badge';
import { invoiceControllerIssueInvoiceV1 } from '#lib/api/generated/invoices/invoices';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateBillingQueries } from '#lib/billing/invalidate-billing-queries';
import { useInvoiceDetail } from '#lib/billing/use-invoice-detail';

type InvoiceDetailDialogProps = {
  invoiceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InvoiceDetailDialog({ invoiceId, open, onOpenChange }: InvoiceDetailDialogProps) {
  const t = useTranslations('operations');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const invoiceQuery = useInvoiceDetail(invoiceId);
  const [isVoiding, setIsVoiding] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const issueMutation = useMutation({
    mutationFn: () => invoiceControllerIssueInvoiceV1(invoiceId),
  });
  const invoice = invoiceQuery.invoice;
  const canWriteInvoice = ability.can('write', 'Invoice');
  const canTakePayment = ability.can('write', 'Payment');

  async function handleIssue(): Promise<void> {
    setActionError(null);
    try {
      const response = await issueMutation.mutateAsync();
      parseApiSuccess<InvoiceDetail>(response, t('billing.issueError'));
      await invalidateBillingQueries(queryClient);
    } catch (error) {
      setActionError(notifyApiError(error, t('billing.issueError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {invoice
              ? t('billing.invoiceNumber', { number: invoice.invoiceNumber })
              : t('billing.invoice')}
          </DialogTitle>
          <DialogDescription>
            {invoice
              ? `${invoice.patient.fullName} · ${invoice.patient.mrn}`
              : t('billing.loadingInvoice')}
          </DialogDescription>
        </DialogHeader>

        {invoiceQuery.isPending ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : null}

        {!invoiceQuery.isPending && !invoice ? (
          <p role="alert" className="text-sm text-rose-700">
            {t('billing.invoiceError')}
          </p>
        ) : null}

        {invoice ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={invoice.status} />
              {invoice.status === 'VOID' && invoice.voidReason ? (
                <p className="text-xs text-slate-500">Voided: {invoice.voidReason}</p>
              ) : null}
            </div>

            <InvoiceItemsList items={invoice.items} totalAmount={invoice.totalAmount} />

            {invoice.payment ? <InvoicePaymentSummary payment={invoice.payment} /> : null}

            {actionError ? (
              <p
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {actionError}
              </p>
            ) : null}

            {invoice.status === 'DRAFT' && canWriteInvoice ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  className="bg-primary-container hover:bg-primary"
                  disabled={issueMutation.isPending}
                  onClick={() => void handleIssue()}
                >
                  {issueMutation.isPending ? 'Issuing...' : 'Issue Invoice'}
                </Button>
              </div>
            ) : null}

            {invoice.status === 'ISSUED' && canTakePayment ? (
              <RecordPaymentForm invoice={invoice} onRecorded={() => onOpenChange(false)} />
            ) : null}

            {isVoiding ? (
              <VoidInvoiceForm
                invoiceId={invoice.id}
                onVoided={() => {
                  setIsVoiding(false);
                  onOpenChange(false);
                }}
                onCancel={() => setIsVoiding(false)}
              />
            ) : invoice.status !== 'PAID' && invoice.status !== 'VOID' && canWriteInvoice ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsVoiding(true)}
                >
                  Void Invoice
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
