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

// The approval panel fetches the registry row governing the template. Under
// the default policy-off posture it is never rendered at all, so the double
// only matters to the policy-on cases.
vi.mock('#lib/managed-documents/use-managed-document', () => ({
  useManagedDocument: () => ({ document: undefined }),
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
  // Policy off — the default posture, so the editor draws no approval chrome.
  approval: {
    isApprovalRequired: false,
    managedDocumentId: null,
    status: null,
    pendingRound: null,
  },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function renderActions(
  overrides: {
    isDirty?: boolean;
    onSaveDraft?: () => Promise<boolean>;
    approval?: DocumentTemplateView['approval'];
  } = {},
) {
  const onSaveDraft = overrides.onSaveDraft ?? vi.fn(async () => true);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="id" messages={messages}>
        <TemplateEditorActions
          template={
            overrides.approval === undefined
              ? TEMPLATE
              : { ...TEMPLATE, approval: overrides.approval }
          }
          canWrite
          isDirty={overrides.isDirty ?? false}
          isSaving={false}
          hasContent
          currentUserId="user-1"
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

  describe('approval policy (P16-T32, US-E5-06)', () => {
    it('draws no approver field, banner or badge while the policy is off', () => {
      renderActions();

      expect(screen.getByRole('button', { name: 'Terbitkan' })).toBeInTheDocument();
      expect(screen.queryByTestId('template-approval-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('template-approval-required')).not.toBeInTheDocument();
    });

    it('replaces publish with submit-for-approval while the policy is on', () => {
      renderActions({
        approval: {
          isApprovalRequired: true,
          managedDocumentId: 'managed-1',
          status: 'DRAFT',
          pendingRound: null,
        },
      });

      expect(screen.queryByRole('button', { name: 'Terbitkan' })).not.toBeInTheDocument();
      expect(screen.getByTestId('template-approval-required')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ajukan persetujuan' })).toBeInTheDocument();
    });

    it('offers withdraw, not another submission, while a round is open', () => {
      renderActions({
        approval: {
          isApprovalRequired: true,
          managedDocumentId: 'managed-1',
          status: 'PENDING_APPROVAL',
          pendingRound: null,
        },
      });

      expect(screen.getByTestId('template-approval-pending')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tarik' })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Ajukan persetujuan' }),
      ).not.toBeInTheDocument();
    });

    it('warns that saving an edit will cost the approvers their round (FR-E5-15)', () => {
      renderActions({
        isDirty: true,
        approval: {
          isApprovalRequired: true,
          managedDocumentId: 'managed-1',
          status: 'PENDING_APPROVAL',
          pendingRound: null,
        },
      });

      expect(screen.getByTestId('template-approval-pending')).toHaveTextContent(
        /belum disimpan/i,
      );
    });
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
