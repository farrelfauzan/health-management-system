'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type {
  InvoiceDetail,
  InvoiceDocumentDownloadView,
  InvoiceDocumentView,
} from '@hms/shared-types';
import { Button, Icon, useAbility } from '@hms/ui';

import {
  invoiceDocumentControllerDownloadDocumentV1,
  invoiceDocumentControllerGetDocumentV1,
  invoiceDocumentControllerRenderDocumentV1,
} from '#lib/api/generated/invoices/invoices';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { useInvoiceDocument } from '#lib/billing/use-invoice-document';

type InvoiceDocumentActionsProps = {
  invoice: InvoiceDetail;
};

/**
 * Download PDF / Print for one invoice (P16-T10).
 *
 * Both actions run the same ensure-then-open flow: render (or adopt the
 * existing document — the API is idempotent per snapshot, so a second click
 * never re-renders), then open a short-lived signed URL that is used once and
 * never stored. The download endpoint pins `attachment` disposition, so
 * *Print* hands the same PDF to the browser and printing happens from the
 * viewer — the dialog has no print stylesheet, and printing page chrome would
 * be worse than one extra keystroke.
 *
 * A render another cashier started shows up through the polling hook as
 * "Rendering…" and the dialog stays fully usable throughout — nothing here
 * blocks payment actions.
 */
export function InvoiceDocumentActions({ invoice }: InvoiceDocumentActionsProps) {
  const ability = useAbility();
  const canWriteInvoice = ability.can('write', 'Invoice');
  const documentQuery = useInvoiceDocument(invoice.id, invoice.status);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const openMutation = useMutation({ mutationFn: ensureReadyAndOpen });
  const invoiceDocument = documentQuery.invoiceDocument;
  const isDraft = invoice.status === 'DRAFT';
  const isBusy = openMutation.isPending;
  const isRenderingElsewhere = !isBusy && invoiceDocument?.status === 'PENDING';
  const failureReason =
    documentError ??
    (invoiceDocument?.status === 'FAILED'
      ? (invoiceDocument.renderError ?? 'The document could not be rendered')
      : null);

  async function ensureReadyAndOpen(): Promise<void> {
    const current = await ensureRenderedDocument();
    if (current.status !== 'READY') {
      throw new Error(current.renderError ?? 'The document is not ready yet — retry in a moment');
    }
    const download = parseApiSuccess<InvoiceDocumentDownloadView>(
      await invoiceDocumentControllerDownloadDocumentV1(invoice.id),
      'Failed to prepare the invoice PDF download',
    );
    window.open(download.data.url, '_blank', 'noopener,noreferrer');
  }

  /**
   * A writer asks the server to render (idempotent; retries a FAILED row); a
   * read-only viewer can only open what already exists.
   */
  async function ensureRenderedDocument(): Promise<InvoiceDocumentView> {
    if (canWriteInvoice) {
      const rendered = parseApiSuccess<InvoiceDocumentView>(
        await invoiceDocumentControllerRenderDocumentV1(invoice.id),
        'Failed to render the invoice PDF',
      );
      return rendered.data;
    }
    const fetched = parseApiSuccess<InvoiceDocumentView>(
      await invoiceDocumentControllerGetDocumentV1(invoice.id),
      'The invoice PDF has not been rendered yet',
    );
    return fetched.data;
  }

  async function handleOpen(): Promise<void> {
    setDocumentError(null);
    try {
      await openMutation.mutateAsync();
    } catch (error) {
      setDocumentError(resolveApiErrorMessage(error, 'Failed to prepare the invoice PDF'));
    } finally {
      if (!isDraft) {
        void documentQuery.refetch();
      }
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Invoice PDF</p>
        {isRenderingElsewhere ? (
          <p className="text-xs text-slate-500">Rendering document...</p>
        ) : null}
        {isBusy ? <p className="text-xs text-slate-500">Preparing document...</p> : null}
      </div>

      {invoiceDocument?.wasBoundRetroactively ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This invoice predates document templates — its layout was bound retroactively to the
          current template.
        </p>
      ) : null}

      {failureReason ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          <span>{failureReason}</span>
          {canWriteInvoice && !isDraft ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={isBusy}
              onClick={() => void handleOpen()}
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isDraft || isBusy}
          onClick={() => void handleOpen()}
        >
          <Icon name="download" size={18} />
          Download PDF
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isDraft || isBusy}
          onClick={() => void handleOpen()}
        >
          <Icon name="print" size={18} />
          Print
        </Button>
      </div>

      {isDraft ? (
        <p className="text-right text-xs text-slate-500">Issue the invoice first</p>
      ) : null}
    </div>
  );
}
