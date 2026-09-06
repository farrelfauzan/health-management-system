import type { DocumentTypeView } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentTypeFormDialog } from './document-type-form-dialog';
import {
  documentTypeControllerCreateTypeV1,
  documentTypeControllerUpdateTypeV1,
} from '#lib/api/generated/document-types/document-types';
import messages from '../../../messages/en/operations.json';

vi.mock('#lib/api/generated/document-types/document-types', () => ({
  documentTypeControllerCreateTypeV1: vi.fn(),
  documentTypeControllerUpdateTypeV1: vi.fn(),
}));

const createMock = vi.mocked(documentTypeControllerCreateTypeV1);
const updateMock = vi.mocked(documentTypeControllerUpdateTypeV1);

function buildType(overrides: Partial<DocumentTypeView> = {}): DocumentTypeView {
  return {
    id: 'type-1',
    code: 'INVOICE_TEMPLATE',
    name: 'Templat faktur',
    description: null,
    behavior: 'INVOICE_TEMPLATE',
    isSystem: true,
    isApprovalRequired: false,
    allowSelfApproval: false,
    requiredApprovals: 1,
    requiresPatient: false,
    requiresDoctor: false,
    contentMode: 'DRAFTED',
    isActive: true,
    sortOrder: 60,
    documentCount: 0,
    defaultApprovers: [],
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
    ...overrides,
  };
}

function renderDialog(type: DocumentTypeView | null) {
  const onOpenChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" timeZone="Asia/Jakarta" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <DocumentTypeFormDialog open type={type} onOpenChange={onOpenChange} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { onOpenChange };
}

describe('DocumentTypeFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue({
      status: 201,
      headers: {},
      data: { data: buildType({ id: 'type-new', isSystem: false, behavior: 'GENERIC' }) },
    } as never);
    updateMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: { data: buildType() },
    } as never);
  });

  it('creates a type without ever sending a behavior field', async () => {
    const user = userEvent.setup();
    renderDialog(null);

    expect(screen.queryByLabelText(/behaviour/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Surat Keterangan Sehat');
    await user.click(screen.getByLabelText('A patient'));
    await user.click(screen.getByRole('button', { name: 'Create type' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const [payload] = createMock.mock.calls[0] ?? [];
    expect(payload).toMatchObject({ name: 'Surat Keterangan Sehat', requiresPatient: true });
    expect(payload).not.toHaveProperty('behavior');
    expect(payload).not.toHaveProperty('code');
  });

  it('shows the system note with the code and behaviour read-only, and renames through PATCH', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog(buildType());

    expect(screen.getByText(/This is a system type/)).toBeInTheDocument();
    expect(screen.getByText('INVOICE_TEMPLATE')).toBeInTheDocument();
    expect(screen.getByText('Publishes an invoice template')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Kuitansi klinik');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const [id, payload] = updateMock.mock.calls[0] ?? [];
    expect(id).toBe('type-1');
    expect(payload).toMatchObject({ name: 'Kuitansi klinik' });
    expect(payload).not.toHaveProperty('code');
    expect(payload).not.toHaveProperty('behavior');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows the persistent warning while self-approval is on', async () => {
    const user = userEvent.setup();
    renderDialog(null);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/Approval required before/));
    await user.click(screen.getByLabelText(/Allow the drafter to approve/));

    expect(screen.getByRole('alert')).toHaveTextContent(/Self-approval is on/);
  });
});
