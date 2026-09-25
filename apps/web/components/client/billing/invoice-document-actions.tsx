'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type {
  InvoiceDetail,
  InvoiceDocumentDownloadView,
  InvoiceDocumentView,
} from '@hms/shared-types';
import { Button, Icon, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
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
 * The invoice PDF for one invoice (P16-T10).
 *
 * One action, ensure-then-open: render (or adopt the existing document — the
 * API is idempotent per snapshot, so a second click never re-renders), then
 * open a short-lived signed URL that is used once and never stored.
 *
 * There is no separate *Print* button. The signed URL pins `attachment`
 * disposition, so a Print button could only hand over the same download under
 * a second name — two buttons that do one thing. The cashier prints from the
 * downloaded PDF, which prints the document itself rather than page chrome.
 *
 * A render another cashier started shows up through the polling hook as
 * "rendering" and the dialog stays fully usable throughout — nothing here
 * blocks payment actions.
 */
export function InvoiceDocumentActions({ invoice }: InvoiceDocumentActionsProps) {
  const t = useTranslations('operations.billing.invoiceDocument');
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
      ? (invoiceDocument.renderError ?? t('renderFailed'))
      : null);

  async function ensureReadyAndOpen(): Promise<void> {
    const current = await ensureRenderedDocument();
    if (current.status !== 'READY') {
      throw new Error(current.renderError ?? t('notReady'));
    }
    const download = parseApiSuccess<InvoiceDocumentDownloadView>(
      await invoiceDocumentControllerDownloadDocumentV1(invoice.id),
      t('downloadError'),
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
        t('renderError'),
      );
      return rendered.data;
    }
    const fetched = parseApiSuccess<InvoiceDocumentView>(
      await invoiceDocumentControllerGetDocumentV1(invoice.id),
      t('notRenderedYet'),
    );
    return fetched.data;
  }

  async function handleOpen(): Promise<void> {
    setDocumentError(null);
    try {
      await openMutation.mutateAsync();
    } catch (error) {
      setDocumentError(resolveApiErrorMessage(error, t('downloadError')));
    } finally {
      if (!isDraft) {
        void documentQuery.refetch();
      }
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{t('title')}</p>
        {isRenderingElsewhere ? <p className="text-xs text-slate-500">{t('rendering')}</p> : null}
        {isBusy ? <p className="text-xs text-slate-500">{t('preparing')}</p> : null}
      </div>

      {invoiceDocument?.wasBoundRetroactively ? (
        <InlineNotice tone="warning">{t('retroactive')}</InlineNotice>
      ) : null}

      {failureReason ? (
        <InlineNotice tone="error" title={failureReason}>
          {canWriteInvoice && !isDraft ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={isBusy}
              onClick={() => void handleOpen()}
            >
              {t('retry')}
            </Button>
          ) : null}
        </InlineNotice>
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
          {t('download')}
        </Button>
      </div>

      {isDraft ? <p className="text-right text-xs text-slate-500">{t('issueFirst')}</p> : null}
    </div>
  );
}
