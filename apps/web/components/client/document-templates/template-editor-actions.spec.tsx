import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DocumentTemplateView } from '@hms/shared-types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  publish: vi.fn(),
}));

vi.mock('#lib/api/generated/document-templates/document-templates', () => ({
  documentTemplateControllerPreviewTemplateV1: mocks.preview,
  documentTemplateControllerPublishTemplateV1: mocks.publish,
}));

const { TemplateEditorActions } = await import('./template-editor-actions');

const TEMPLATE: DocumentTemplateView = {
  id: 'template-1',
  kind: 'INVOICE',
  name: 'Kuitansi',
  description: null,
  status: 'DRAFT',
  isDefault: false,
  contentHtml: '<p><span data-hms-var="patient.mrn"></span></p>',
  settings: {
    paperSize: 'A4',
    orientation: 'PORTRAIT',
    marginMm: { top: 10, right: 10, bottom: 10, left: 10 },
    itemsColumns: ['item.no', 'item.description', 'item.quantity', 'item.unitPrice', 'item.amount'],
  },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function renderActions(overrides: { isDirty?: boolean; onSaveDraft?: () => Promise<boolean> } = {}) {
  const onSaveDraft = overrides.onSaveDraft ?? vi.fn(async () => true);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="id" messages={messages}>
        <TemplateEditorActions
          template={TEMPLATE}
          canWrite
          isDirty={overrides.isDirty ?? false}
          isSaving={false}
          hasContent
          onSaveDraft={onSaveDraft}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onSaveDraft;
}

describe('TemplateEditorActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the fixture preview in a dialog after a successful render', async () => {
    const user = userEvent.setup();
    mocks.preview.mockResolvedValue({
      status: 200,
      data: {
        data: {
          url: 'https://objects.example/preview.pdf?sig=1',
          expiresAt: '2026-09-01T05:05:00.000Z',
          warnings: [{ token: 'clinic.logo', reason: 'no logo in fixture' }],
        },
      },
    });
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Pratinjau' }));

    const frame = await screen.findByTestId('template-preview-frame');
    expect(frame).toHaveAttribute('src', 'https://objects.example/preview.pdf?sig=1');
    expect(screen.getByText(/clinic\.logo/)).toBeInTheDocument();
    expect(mocks.preview).toHaveBeenCalledWith('template-1');
  });

  it('saves a dirty draft before previewing and never previews a failed save', async () => {
    const user = userEvent.setup();
    const onSaveDraft = renderActions({ isDirty: true, onSaveDraft: vi.fn(async () => false) });

    await user.click(screen.getByRole('button', { name: 'Simpan & pratinjau' }));

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('lists the unknown tokens beside the action when publish is refused', async () => {
    const user = userEvent.setup();
    mocks.publish.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          error: {
            code: 'DOCUMENT_TEMPLATE_UNKNOWN_TOKENS',
            message: 'refused',
            details: { unknownTokens: ['patient.mrnTypo'] },
          },
        },
      },
    });
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Terbitkan' }));

    const alert = await screen.findByTestId('template-publish-errors');
    expect(alert).toHaveTextContent('Penerbitan ditolak: 1 variabel tidak ada di daftar');
    expect(alert).toHaveTextContent('{{patient.mrnTypo}}');
  });

  it('surfaces a preview failure with a retry, not a vanishing toast', async () => {
    const user = userEvent.setup();
    mocks.preview.mockRejectedValue({
      isAxiosError: true,
      response: { status: 503, data: { error: { code: 'SERVICE_UNAVAILABLE', message: 'PDF renderer is not configured' } } },
    });
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Pratinjau' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('PDF renderer is not configured');
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });
});
