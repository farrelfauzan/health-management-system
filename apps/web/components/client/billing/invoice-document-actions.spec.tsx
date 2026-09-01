import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InvoiceDetail, InvoiceDocumentView } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvoiceDocumentActions } from './invoice-document-actions';
import {
  invoiceDocumentControllerDownloadDocumentV1,
  invoiceDocumentControllerGetDocumentV1,
  invoiceDocumentControllerRenderDocumentV1,
} from '#lib/api/generated/invoices/invoices';

vi.mock('#lib/api/generated/invoices/invoices', () => ({
  invoiceDocumentControllerRenderDocumentV1: vi.fn(),
  invoiceDocumentControllerGetDocumentV1: vi.fn(),
  invoiceDocumentControllerDownloadDocumentV1: vi.fn(),
  getInvoiceDocumentControllerGetDocumentV1QueryKey: (id: string) => ['invoice-document', id],
}));

const renderRequestMock = vi.mocked(invoiceDocumentControllerRenderDocumentV1);
const getRequestMock = vi.mocked(invoiceDocumentControllerGetDocumentV1);
const downloadRequestMock = vi.mocked(invoiceDocumentControllerDownloadDocumentV1);

const CASHIER_RULES: AppRule[] = [
  { action: 'read', subject: 'Invoice' },
  { action: 'write', subject: 'Invoice' },
];

function buildInvoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: 'invoice-1',
    invoiceNumber: 'INV/20260901/0007',
    patientId: 'patient-1',
    patient: { id: 'patient-1', mrn: 'RM-000142', fullName: 'Siti Rahmawati' },
    status: 'PAID',
    totalAmount: 275000,
    items: [],
    createdAt: '2026-09-01T02:00:00.000Z',
    updatedAt: '2026-09-01T03:00:00.000Z',
    ...overrides,
  };
}

function buildDocumentView(overrides: Partial<InvoiceDocumentView> = {}): InvoiceDocumentView {
  return {
    id: 'document-1',
    invoiceId: 'invoice-1',
    status: 'READY',
    hasVoidWatermark: false,
    wasBoundRetroactively: false,
    checksum: 'abc123',
    warnings: [],
    createdAt: '2026-09-01T03:00:00.000Z',
    updatedAt: '2026-09-01T03:05:00.000Z',
    ...overrides,
  };
}

function buildEnvelope<TData>(data: TData) {
  return { status: 200, headers: {}, data: { data } };
}

function renderActions(invoice: InvoiceDetail, rules: AppRule[] = CASHIER_RULES): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <AbilityProvider ability={buildAppAbility(rules)}>
      <QueryClientProvider client={queryClient}>
        <InvoiceDocumentActions invoice={invoice} />
      </QueryClientProvider>
    </AbilityProvider>,
  );
}

describe('InvoiceDocumentActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'open').mockImplementation(() => null);
    getRequestMock.mockResolvedValue(buildEnvelope(buildDocumentView()) as never);
    renderRequestMock.mockResolvedValue(buildEnvelope(buildDocumentView()) as never);
    downloadRequestMock.mockResolvedValue(
      buildEnvelope({
        url: 'https://signed.example/doc.pdf',
        fileName: 'INV-20260901-0007.pdf',
        expiresAt: '2026-09-01T07:15:00.000Z',
      }) as never,
    );
  });

  it('disables both actions on a DRAFT invoice with the issue-first hint', () => {
    renderActions(buildInvoice({ status: 'DRAFT' }));

    expect(screen.getByRole('button', { name: /download pdf/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /print/i })).toBeDisabled();
    expect(screen.getByText('Issue the invoice first')).toBeInTheDocument();
    // A DRAFT has no document; asking would only 404.
    expect(getRequestMock).not.toHaveBeenCalled();
  });

  it('renders, then opens the signed download for a PAID invoice', async () => {
    renderActions(buildInvoice());

    await userEvent.click(screen.getByRole('button', { name: /download pdf/i }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        'https://signed.example/doc.pdf',
        '_blank',
        'noopener,noreferrer',
      );
    });
    expect(renderRequestMock).toHaveBeenCalledWith('invoice-1');
    expect(downloadRequestMock).toHaveBeenCalledWith('invoice-1');
  });

  it('runs the same ensure-then-open flow from the Print action', async () => {
    renderActions(buildInvoice({ status: 'VOID', voidReason: 'wrong patient' }));

    await userEvent.click(screen.getByRole('button', { name: /print/i }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledTimes(1);
    });
    expect(renderRequestMock).toHaveBeenCalledTimes(1);
  });

  it('shows the render failure with a Retry action and opens nothing', async () => {
    renderRequestMock.mockResolvedValue(
      buildEnvelope(
        buildDocumentView({ status: 'FAILED', renderError: 'PDF renderer is unreachable' }),
      ) as never,
    );

    renderActions(buildInvoice());
    await userEvent.click(screen.getByRole('button', { name: /download pdf/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('PDF renderer is unreachable');
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
    expect(downloadRequestMock).not.toHaveBeenCalled();
  });

  it('retries a failed render from the Retry action', async () => {
    renderRequestMock.mockResolvedValueOnce(
      buildEnvelope(buildDocumentView({ status: 'FAILED', renderError: 'Renderer down' })) as never,
    );

    renderActions(buildInvoice());
    await userEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledTimes(1);
    });
    expect(renderRequestMock).toHaveBeenCalledTimes(2);
  });

  it('flags a retroactively bound pre-Phase-16 invoice', async () => {
    getRequestMock.mockResolvedValue(
      buildEnvelope(buildDocumentView({ wasBoundRetroactively: true })) as never,
    );

    renderActions(buildInvoice());

    expect(await screen.findByText(/bound retroactively/i)).toBeInTheDocument();
  });

  it('lets a read-only viewer open an existing document without asking for a render', async () => {
    renderActions(buildInvoice(), [{ action: 'read', subject: 'Invoice' }]);

    await userEvent.click(screen.getByRole('button', { name: /download pdf/i }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledTimes(1);
    });
    expect(renderRequestMock).not.toHaveBeenCalled();
  });
});
