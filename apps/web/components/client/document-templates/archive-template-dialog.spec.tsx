import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DocumentTemplateView } from '@hms/shared-types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ArchiveTemplateDialog } from './archive-template-dialog';
import { documentTemplateControllerArchiveTemplateV1 } from '#lib/api/generated/document-templates/document-templates';
import messages from '../../../messages/en/operations.json';

vi.mock('#lib/api/generated/document-templates/document-templates', () => ({
  documentTemplateControllerArchiveTemplateV1: vi.fn(),
}));

const archiveMock = vi.mocked(documentTemplateControllerArchiveTemplateV1);

function buildTemplate(overrides: Partial<DocumentTemplateView> = {}): DocumentTemplateView {
  return {
    id: 'template-1',
    kind: 'INVOICE',
    name: 'Testing Receipt',
    description: null,
    status: 'PUBLISHED',
    isDefault: false,
    contentHtml: '<p></p>',
    settings: {
      paperSize: 'A4',
      orientation: 'PORTRAIT',
      marginMm: { top: 10, right: 10, bottom: 10, left: 10 },
      itemsColumns: ['item.no'],
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
    ...overrides,
  };
}

function renderDialog(template: DocumentTemplateView | null) {
  const onOpenChange = vi.fn();
  const onArchived = vi.fn();
  const onFailed = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" timeZone="Asia/Jakarta" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <ArchiveTemplateDialog
          template={template}
          onOpenChange={onOpenChange}
          onArchived={onArchived}
          onFailed={onFailed}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { onOpenChange, onArchived, onFailed };
}

describe('ArchiveTemplateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    archiveMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: { data: { id: 'template-1', archivedAt: '2026-09-06T00:00:00.000Z' } },
    } as never);
  });

  it('names the template, explains what stays, and archives on confirm', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onArchived } = renderDialog(buildTemplate());

    expect(screen.getByRole('heading', { name: 'Archive “Testing Receipt”?' })).toBeInTheDocument();
    expect(screen.getByText(/Published versions stay attached/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Archive template' }));

    await waitFor(() => expect(archiveMock).toHaveBeenCalledWith('template-1'));
    expect(onArchived).toHaveBeenCalledWith('Template archived.');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('refuses the default template and says what to do instead', () => {
    renderDialog(buildTemplate({ isDefault: true }));

    expect(screen.getByRole('alert')).toHaveTextContent('Set another template as default first');
    expect(screen.getByRole('button', { name: 'Archive template' })).toBeDisabled();
  });

  it('reports a failed archive and stays open', async () => {
    const user = userEvent.setup();
    archiveMock.mockRejectedValue(new Error('nope'));
    const { onFailed, onOpenChange } = renderDialog(buildTemplate());

    await user.click(screen.getByRole('button', { name: 'Archive template' }));

    await waitFor(() => expect(onFailed).toHaveBeenCalledWith('nope'));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('renders nothing when no template is chosen', () => {
    renderDialog(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
